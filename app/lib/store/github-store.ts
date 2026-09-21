/**
 * Shared GitHub Gist transport for every store in this app — private
 * per-user data (`gist.ts`, `guidelines.ts`, `advice-gist.ts`) and the
 * shared public catalog (`catalog/lib.ts`) alike. One place for auth
 * headers, request timeouts and the truncated-content work-around, instead
 * of four near-identical copies (see Phase 1 in
 * `docs/STORAGE_MIGRATION_PLAN.md`).
 *
 * This module moves **bytes**, not documents: it reads and writes raw file
 * text. Parsing, schema validation and normalization stay in each domain
 * module, exactly as before — a shared transport layer has no business
 * knowing what an `EtfGuideline` looks like.
 *
 * `location` names the gist id in this phase. It is spelled generically
 * (not `gistId`) because Phase 2 adds a repository backend behind the same
 * shape, where `location` becomes an `owner/repo` string instead.
 *
 * Every {@link StoredFile} carries a `version`, always `null` here: no
 * caller relies on it yet, and this backend does not honor
 * `expectedVersion` on a write. Both exist so a later phase can wire
 * compare-and-swap without changing this module's shape again — see
 * Phase 5 in the migration plan.
 */

const GITHUB_API = 'https://api.github.com'
const GITHUB_REQUEST_TIMEOUT_MS = 5_000

export type GistFile = {
	content: string | null
	/**
	 * The gist API truncates file content once the *whole response* grows
	 * past about 1 MB — so a large file beside a small one truncates the
	 * small one too. The full file is always at `raw_url`.
	 */
	truncated?: boolean
	raw_url?: string
}

export type GistPayload = {
	files: Record<string, GistFile>
	owner?: { login?: string }
}

export type StoredFile = {
	/** Raw file text, exactly as stored — never parsed here. */
	content: string
	/** Opaque compare-and-swap token. Always `null` until a CAS-capable backend lands. */
	version: string | null
}

/** Auth header for a token-bearing request. Exported so callers outside this
 * module's read/write helpers (gist discovery, gist creation) build the same
 * headers instead of a fifth copy. */
export function githubHeaders(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': '2022-11-28',
	}
}

function readHeaders(token: string | null): HeadersInit {
	if (token === null) {
		return {
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		}
	}
	return githubHeaders(token)
}

/**
 * A gist file's full content: `content` when the API sent all of it,
 * otherwise downloaded from `raw_url`. Throws when that download fails, so a
 * caller never mistakes half a file for the whole one.
 */
async function readFullFileContent(file: GistFile): Promise<string | null> {
	if (file.truncated !== true) return file.content
	if (!file.raw_url) {
		throw new Error('Gist file is truncated and has no raw_url')
	}
	const response = await fetch(file.raw_url, {
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
	})
	if (!response.ok) {
		throw new Error(`Could not download gist file: ${response.status}`)
	}
	return response.text()
}

export type ReadFilesResult =
	| {
			ok: true
			/** One entry per requested path; `null` when that file is absent or empty. */
			files: Record<string, StoredFile | null>
			/** The gist owner's login, when the API reported one (anonymous reads only omit it if the gist has none). */
			owner: string | null
	  }
	| { ok: false; status: number }

/**
 * Reads one or more named files from one gist in a single request — reading
 * two files from the same gist costs one round trip, not two, the same as
 * hand-rolling it against the gist payload directly.
 *
 * `token: null` reads anonymously (the shared catalog's current behaviour;
 * see problem #4 in the migration plan). A network failure (DNS, timeout)
 * propagates as a thrown error, same as a bare `fetch` would — callers that
 * want it swallowed already catch around their read, and should keep doing
 * so here.
 */
export async function readFiles(params: {
	token: string | null
	location: string
	paths: readonly string[]
}): Promise<ReadFilesResult> {
	const response = await fetch(`${GITHUB_API}/gists/${params.location}`, {
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: readHeaders(params.token),
	})
	if (!response.ok) return { ok: false, status: response.status }
	const payload = (await response.json()) as GistPayload

	const files: Record<string, StoredFile | null> = {}
	for (const path of params.paths) {
		const file = payload.files[path]
		if (!file) {
			files[path] = null
			continue
		}
		const content = await readFullFileContent(file)
		files[path] = content === null ? null : { content, version: null }
	}
	const ownerLogin = payload.owner?.login
	const owner =
		typeof ownerLogin === 'string' && ownerLogin.length > 0 ? ownerLogin : null
	return { ok: true, files, owner }
}

export type ReadFileResult =
	| { ok: true; file: StoredFile | null; owner: string | null }
	| { ok: false; status: number }

/** Reads one named file from one gist. See {@link readFiles} to read several at once. */
export async function readFile(params: {
	token: string | null
	location: string
	path: string
}): Promise<ReadFileResult> {
	const result = await readFiles({ ...params, paths: [params.path] })
	if (!result.ok) return result
	return {
		ok: true,
		file: result.files[params.path] ?? null,
		owner: result.owner,
	}
}

export type WriteFilesResult =
	| { ok: true }
	| {
			ok: false
			status: number
			/**
			 * The rejected response, for a caller that wants to read its body for
			 * extra detail in an error message (as `saveEtfs` did before this
			 * module existed). Most callers only need `status`.
			 */
			response: Response
	  }

/**
 * Writes and/or deletes one or more files in one gist with a single atomic
 * PATCH. A `null` value deletes that file — the same convention the gist API
 * itself uses.
 *
 * `expectedVersion` is accepted for forward compatibility with a future
 * compare-and-swap backend; this gist backend does not honor it — see the
 * module doc.
 */
export async function writeFiles(params: {
	token: string
	location: string
	files: Record<string, string | null>
	expectedVersion?: string | null
}): Promise<WriteFilesResult> {
	const body = {
		files: Object.fromEntries(
			Object.entries(params.files).map(([path, content]) => [
				path,
				content === null ? null : { content },
			]),
		),
	}
	const response = await fetch(`${GITHUB_API}/gists/${params.location}`, {
		method: 'PATCH',
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(params.token),
		body: JSON.stringify(body),
	})
	if (!response.ok) return { ok: false, status: response.status, response }
	return { ok: true }
}

/** Writes or deletes one file. See {@link writeFiles} for an atomic multi-file write. */
export async function writeFile(params: {
	token: string
	location: string
	path: string
	content: string | null
	expectedVersion?: string | null
}): Promise<WriteFilesResult> {
	return writeFiles({
		token: params.token,
		location: params.location,
		files: { [params.path]: params.content },
		expectedVersion: params.expectedVersion,
	})
}
