/**
 * The storage layer: private per-user data and the shared catalog both live in
 * GitHub repositories, read and written through this module. See
 * `docs/STORAGE_MIGRATION_PLAN.md` for how the app got here from gists.
 *
 * This module moves **bytes**, not documents: it reads and writes raw file
 * text. Parsing, schema validation and normalization stay in each domain
 * module — a transport layer has no business knowing what an `EtfGuideline`
 * looks like.
 *
 * `location` is `"owner/repo"` — one string, because a GitHub login or repo
 * name can never contain `/`, so the split is unambiguous.
 * {@link parseRepoLocation} is the only place that needs to know this.
 *
 * - A repo file update always requires the blob's current `sha` — there is no
 *   "just overwrite" option on the Contents API. A caller that does not
 *   supply `expectedVersion` has {@link writeFile} read the current `sha`
 *   first (last write wins). A caller that does supply one gets GitHub's own
 *   rejection of a stale `sha` as the compare-and-swap signal.
 * - A multi-file atomic write is a five-request Git Data sequence (read the
 *   branch ref, read its commit, create a blob per changed file, create a tree
 *   layering those blobs on the current one, create a commit, then update the
 *   ref non-fast-forward — which is where the atomicity comes from: a ref that
 *   moved since we read it rejects the update instead of silently losing a
 *   concurrent write).
 * - A multi-file *read* costs one request per path (parallelized, but still
 *   one each against the rate limit).
 *
 * Every {@link StoredFile} carries the real blob `sha` as `version`.
 */

import { isPreview } from '../deployment.ts'

/** One GitHub REST API root and one timeout policy for every request. */
export const GITHUB_API = 'https://api.github.com'
export const GITHUB_REQUEST_TIMEOUT_MS = 5_000

/**
 * File contents keyed by path, the shape every domain parser takes. A missing
 * file is absent from `files`; `content: null` is a present-but-empty one.
 */
export type FilesPayload = {
	files: Record<string, { content: string | null }>
}

export type StoredFile = {
	/** Raw file text, exactly as stored — never parsed here. */
	content: string
	/** Opaque compare-and-swap token: the blob `sha` the content was read at. */
	version: string | null
}

/** Auth header for a token-bearing request. */
export function githubHeaders(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': '2022-11-28',
	}
}

/**
 * The private data repo's fixed name; preview has its own repo. `preview`
 * defaults to the running deployment.
 */
export function getDataRepoName(options: { preview?: boolean } = {}): string {
	const preview = options.preview ?? isPreview()
	return preview ? 'ainvestor-preview-data' : 'ainvestor-data'
}

export const REPO_MARKER_PATH = '.ainvestor.json'
export const REPO_MARKER_CONTENT = JSON.stringify(
	{ app: 'ainvestor-data', version: 1 },
	null,
	2,
)

/** Splits a `"owner/repo"` location. Never throws — a malformed location is a caller bug, not a network failure, so callers assert on the result. */
export function parseRepoLocation(
	location: string,
): { owner: string; repo: string } | null {
	const slash = location.indexOf('/')
	if (slash <= 0 || slash === location.length - 1) return null
	const owner = location.slice(0, slash)
	const repo = location.slice(slash + 1)
	if (owner.includes('/') || repo.includes('/')) return null
	return { owner, repo }
}

function repoLocationOrThrow(location: string): {
	owner: string
	repo: string
} {
	const parsed = parseRepoLocation(location)
	if (!parsed) {
		throw new Error(`Not a valid "owner/repo" location: ${location}`)
	}
	return parsed
}

function contentsUrl(params: { owner: string; repo: string; path: string }) {
	return `${GITHUB_API}/repos/${params.owner}/${params.repo}/contents/${params.path}`
}

/** Decodes the Contents API's base64 body (GitHub line-wraps it every 60 chars). */
function decodeBase64Content(base64: string): string {
	return Buffer.from(base64.replace(/\n/g, ''), 'base64').toString('utf-8')
}

function encodeBase64Content(text: string): string {
	return Buffer.from(text, 'utf-8').toString('base64')
}

// ---------------------------------------------------------------------------
// Repo discovery / creation
// ---------------------------------------------------------------------------

/**
 * The login a token belongs to, and the scopes it was granted. A classic or
 * OAuth token reports its scopes in `X-OAuth-Scopes`; a fine-grained token
 * sends no such header, so `scopes` is `null` there — "unknown", not "none".
 * Throws on a rejected token, with the status in the message.
 */
export async function fetchAuthenticatedUser(
	token: string,
): Promise<{ login: string; scopes: string[] | null }> {
	const response = await fetch(`${GITHUB_API}/user`, {
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(token),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error reading the token's user: ${response.status}`,
		)
	}
	const body = (await response.json()) as { login?: unknown }
	if (typeof body.login !== 'string' || body.login.length === 0) {
		throw new Error('GitHub did not report a login for this token')
	}
	const scopesHeader = response.headers.get('x-oauth-scopes')
	const scopes =
		scopesHeader === null
			? null
			: scopesHeader
					.split(',')
					.map((scope) => scope.trim())
					.filter((scope) => scope.length > 0)
	return { login: body.login, scopes }
}

type RepoMetadata = { defaultBranch: string }

async function getRepoMetadata(params: {
	token: string
	owner: string
	repo: string
}): Promise<{ found: true; metadata: RepoMetadata } | { found: false }> {
	const response = await fetch(
		`${GITHUB_API}/repos/${params.owner}/${params.repo}`,
		{
			signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
			headers: githubHeaders(params.token),
		},
	)
	if (response.status === 404) return { found: false }
	if (!response.ok) {
		throw new Error(`GitHub API error reading repo: ${response.status}`)
	}
	const body = (await response.json()) as { default_branch?: string }
	return {
		found: true,
		metadata: { defaultBranch: body.default_branch ?? 'main' },
	}
}

/**
 * What this token may do with a repo: `found: false` when GitHub answers 404 —
 * which for a private repo means "not visible to you" as much as "does not
 * exist", so the two are deliberately one case. `canWrite` is GitHub's own
 * `permissions.push` for the token's user: whoever GitHub lets push is whoever
 * may change what the repo holds. Throws on any other refusal, with the status.
 */
export async function getRepoAccess(params: {
	token: string
	location: string
}): Promise<{ found: false } | { found: true; canWrite: boolean }> {
	const { owner, repo } = repoLocationOrThrow(params.location)
	const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(params.token),
	})
	if (response.status === 404) return { found: false }
	if (!response.ok) {
		throw new Error(
			`GitHub API error reading ${owner}/${repo}: ${response.status}`,
		)
	}
	const body = (await response.json()) as { permissions?: { push?: unknown } }
	return { found: true, canWrite: body.permissions?.push === true }
}

/**
 * Whether the repo carries this app's ownership marker file. A repo that
 * exists but confirms it lacks the marker (`found: false`, a 404) is never
 * treated as ours — see {@link findOrCreateDataRepo}. A request that fails
 * for another reason (rate limit, timeout, a 5xx) is reported as `ok: false`
 * rather than folded into "lacks the marker" — a transient GitHub failure on
 * the *owner's own* already-marked repo must not be misreported as someone
 * else's repo blocking sign-in.
 */
async function hasOwnershipMarker(params: {
	token: string
	owner: string
	repo: string
}): Promise<{ found: boolean } | { ok: false; status: number }> {
	const response = await fetch(
		contentsUrl({ ...params, path: REPO_MARKER_PATH }),
		{
			signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
			headers: githubHeaders(params.token),
		},
	)
	if (response.status === 404) return { found: false }
	if (!response.ok) return { ok: false, status: response.status }
	return { found: true }
}

/**
 * Thrown when `<login>/ainvestor-data` (or the preview equivalent) already
 * exists but was not created by this app. Refuses rather than silently
 * falling back to an auto-suffixed name — a repo the app did not create is
 * never touched, and where a user's data ends up living is never decided
 * without them noticing.
 */
export class ForeignRepoError extends Error {
	constructor(owner: string, repoName: string) {
		super(
			`${owner}/${repoName} already exists and was not created by this app ` +
				`(no ${REPO_MARKER_PATH} marker found). Rename or delete it, then sign in again.`,
		)
		this.name = 'ForeignRepoError'
	}
}

/**
 * Finds the caller's data repo without creating it. Returns its `location`
 * (`"owner/repo"`), or `null` when no repo by that name exists. A repo that
 * exists without the ownership marker throws {@link ForeignRepoError}.
 *
 * Unlike the gist discovery this replaced, this never pages a list looking for a match: the
 * repo name is fixed and deterministic, so one `GET` on the known
 * `owner/name` either finds it or doesn't.
 */
export async function findDataRepo(params: {
	token: string
	login: string
	repoName?: string
}): Promise<string | null> {
	const { token, login } = params
	const repoName = params.repoName ?? getDataRepoName()
	const existing = await getRepoMetadata({
		token,
		owner: login,
		repo: repoName,
	})
	if (!existing.found) return null

	const marker = await hasOwnershipMarker({
		token,
		owner: login,
		repo: repoName,
	})
	if ('ok' in marker) {
		throw new Error(
			`GitHub API error checking ownership marker: ${marker.status}`,
		)
	}
	if (!marker.found) throw new ForeignRepoError(login, repoName)
	return `${login}/${repoName}`
}

/**
 * Finds the caller's data repo, or creates it. Returns its `location`
 * (`"owner/repo"`). Never returns a repo without the ownership marker —
 * throws {@link ForeignRepoError} instead.
 */
export async function findOrCreateDataRepo(params: {
	token: string
	login: string
	repoName?: string
}): Promise<string> {
	const { token, login } = params
	const repoName = params.repoName ?? getDataRepoName()
	const existing = await findDataRepo({ token, login, repoName })
	if (existing !== null) return existing

	const createResponse = await fetch(`${GITHUB_API}/user/repos`, {
		method: 'POST',
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(token),
		body: JSON.stringify({
			name: repoName,
			private: true,
			auto_init: true, // an empty repo has no default branch; the Contents API 404s on it otherwise
			description: 'Private data store for the AI Investor app.',
		}),
	})
	if (!createResponse.ok) {
		throw new Error(
			`GitHub API error creating data repo: ${createResponse.status}`,
		)
	}

	const markerWrite = await writeFile({
		token,
		location: `${login}/${repoName}`,
		path: REPO_MARKER_PATH,
		content: REPO_MARKER_CONTENT,
	})
	if (!markerWrite.ok) {
		// Without the marker, every later lookup refuses this repo as foreign —
		// so say plainly that the half-made repo is ours and safe to delete.
		throw new Error(
			`Created ${login}/${repoName} but could not write its ownership marker ` +
				`(GitHub API error ${markerWrite.status}). It holds only GitHub's initial README: delete it and try again.`,
		)
	}

	return `${login}/${repoName}`
}

// ---------------------------------------------------------------------------
// Single-file read/write — GitHub Contents API
// ---------------------------------------------------------------------------

type ContentsFile = { content: string; sha: string }

/**
 * Fetches a blob's content directly by sha. The Contents API omits inline
 * content for a file over ~1MB (`content: ''`, `encoding: 'none'`). The Git
 * Data blob endpoint has no such limit until 100MB, and every
 * {@link getContentsFile} response already carries the sha this needs, so no
 * extra lookup is required.
 */
async function getBlobContent(params: {
	token: string
	owner: string
	repo: string
	path: string
	sha: string
}): Promise<
	{ found: true; file: ContentsFile } | { ok: false; status: number }
> {
	const response = await fetch(
		`${GITHUB_API}/repos/${params.owner}/${params.repo}/git/blobs/${params.sha}`,
		{
			signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
			headers: githubHeaders(params.token),
		},
	)
	if (!response.ok) return { ok: false, status: response.status }
	const blob = (await response.json()) as { content: string; encoding: string }
	if (blob.encoding !== 'base64') {
		throw new Error(
			`${params.path} blob has unexpected encoding: ${blob.encoding}`,
		)
	}
	return {
		found: true,
		file: { content: decodeBase64Content(blob.content), sha: params.sha },
	}
}

async function getContentsFile(params: {
	token: string
	owner: string
	repo: string
	path: string
}): Promise<
	| { found: true; file: ContentsFile }
	| { found: false }
	| { ok: false; status: number }
> {
	const response = await fetch(contentsUrl(params), {
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(params.token),
	})
	if (response.status === 404) return { found: false }
	if (!response.ok) return { ok: false, status: response.status }
	const body = (await response.json()) as {
		content?: string
		encoding?: string
		sha: string
	}
	if (typeof body.content !== 'string') {
		// A directory listing, not a file — not a shape any caller here expects.
		throw new Error(
			`${params.path} is not a file in ${params.owner}/${params.repo}`,
		)
	}
	if (body.content === '' && body.encoding === 'none') {
		return getBlobContent({ ...params, sha: body.sha })
	}
	return {
		found: true,
		file: { content: decodeBase64Content(body.content), sha: body.sha },
	}
}

export type ReadFileResult =
	| { ok: true; file: StoredFile | null }
	| { ok: false; status: number }

/** Reads one file from a data repo. */
export async function readFile(params: {
	token: string
	location: string
	path: string
}): Promise<ReadFileResult> {
	const { owner, repo } = repoLocationOrThrow(params.location)
	const result = await getContentsFile({
		token: params.token,
		owner,
		repo,
		path: params.path,
	})
	if ('ok' in result) return result
	if (!result.found) return { ok: true, file: null }
	return {
		ok: true,
		file: { content: result.file.content, version: result.file.sha },
	}
}

export type ReadFilesResult =
	| { ok: true; files: Record<string, StoredFile | null> }
	| { ok: false; status: number }

/**
 * Reads several files from a data repo — one request per path (parallelized),
 * since the Contents API has no bundled-multi-file response (a gist, the old backend, had one)
 * GET does. The first rejected read's status wins if more than one fails.
 */
export async function readFiles(params: {
	token: string
	location: string
	paths: readonly string[]
}): Promise<ReadFilesResult> {
	const results = await Promise.all(
		params.paths.map(async (path) => {
			const result = await readFile({ ...params, path })
			return [path, result] as const
		}),
	)
	const failed = results.find(([, result]) => !result.ok)
	if (failed) {
		const [, result] = failed
		return result as { ok: false; status: number }
	}
	const files = Object.fromEntries(
		results.map(([path, result]) => [
			path,
			(result as { ok: true; file: StoredFile | null }).file,
		]),
	)
	return { ok: true, files }
}

/**
 * Whether a refused write was refused because the file changed since it was
 * read. GitHub answers a stale `sha` with 409. A 422 means it too only for a
 * write that expected the file to be absent (`expectedVersion: null`): the
 * update then names no `sha` for a file another client has since created.
 * Any other 422 — a ruleset, a bad payload, a size limit — is a refusal that
 * retrying cannot fix, so it must not be taken for a lost race.
 */
export function isVersionConflict(params: {
	status: number
	expectedVersion: string | null
}): boolean {
	if (params.status === 409) return true
	return params.status === 422 && params.expectedVersion === null
}

export type WriteFileResult =
	| { ok: true; version: string }
	| { ok: false; status: number; response: Response }

/**
 * Writes or deletes one file. `content: null` deletes it (a no-op success if
 * it was already absent, matching the old gist backend's convention).
 *
 * `expectedVersion` picks the write's contract:
 * - **omitted**: reads the file's current `sha` first so the write can succeed
 *   at all (the Contents API rejects an update with no `sha`). Not
 *   compare-and-swap — the read-then-write is not atomic against a concurrent
 *   writer — so this is last-write-wins, for files nobody races on (advice).
 * - **a version string**: the write succeeds only if the file still has that
 *   `sha`; GitHub refuses a stale one, which {@link isVersionConflict} names.
 * - **`null`**: the write succeeds only if the file does not exist yet. A
 *   deletion of an absent file is still the no-op success it always was.
 */
export async function writeFile(params: {
	token: string
	location: string
	path: string
	content: string | null
	expectedVersion?: string | null
	/** Commit message; defaults to `Update <path>` / `Remove <path>`. */
	message?: string
}): Promise<WriteFileResult> {
	const { owner, repo } = repoLocationOrThrow(params.location)
	const url = contentsUrl({ owner, repo, path: params.path })

	let sha = params.expectedVersion ?? undefined
	if (params.expectedVersion === undefined) {
		const current = await getContentsFile({
			token: params.token,
			owner,
			repo,
			path: params.path,
		})
		if ('ok' in current)
			return {
				ok: false,
				status: current.status,
				response: new Response(null, { status: current.status }),
			}
		if (current.found) sha = current.file.sha
	}

	if (params.content === null) {
		if (sha === undefined) return { ok: true, version: '' } // nothing to delete
		const response = await fetch(url, {
			method: 'DELETE',
			signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
			headers: githubHeaders(params.token),
			body: JSON.stringify({
				message: params.message ?? `Remove ${params.path}`,
				sha,
			}),
		})
		if (!response.ok) return { ok: false, status: response.status, response }
		return { ok: true, version: '' }
	}

	const response = await fetch(url, {
		method: 'PUT',
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(params.token),
		body: JSON.stringify({
			message: params.message ?? `Update ${params.path}`,
			content: encodeBase64Content(params.content),
			...(sha !== undefined ? { sha } : {}),
		}),
	})
	if (!response.ok) return { ok: false, status: response.status, response }
	const body = (await response.json()) as { content: { sha: string } }
	return { ok: true, version: body.content.sha }
}

// ---------------------------------------------------------------------------
// Multi-file atomic write — Git Data API
// ---------------------------------------------------------------------------

type GitDataFailure = {
	ok: false
	status: number
	response: Response
	/**
	 * The branch moved past `expectedVersion` before the commit landed: another
	 * client wrote first. Only ever set when `expectedVersion` was passed.
	 */
	conflict?: true
}

async function gitDataRequest(params: {
	token: string
	owner: string
	repo: string
	path: string
	method?: string
	body?: unknown
}): Promise<Response> {
	return fetch(
		`${GITHUB_API}/repos/${params.owner}/${params.repo}/git/${params.path}`,
		{
			method: params.method ?? 'GET',
			signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
			headers: githubHeaders(params.token),
			...(params.body !== undefined
				? { body: JSON.stringify(params.body) }
				: {}),
		},
	)
}

export type WriteFilesResult = { ok: true } | GitDataFailure

/**
 * Writes and/or deletes several files in one repo in a single commit: read
 * the branch ref, read its commit, create a blob per changed file, layer a
 * new tree on the current one, commit it, then move the ref to the new
 * commit non-fast-forward — a ref that moved since we read it rejects the
 * update rather than losing a concurrent write.
 *
 * `expectedVersion` names the parent commit to build on — the head the caller
 * read its content at (see {@link readHeadCommit}), which makes the write
 * compare-and-swap: if the branch has moved since, GitHub refuses the
 * non-fast-forward ref update and the result carries `conflict: true`. When
 * omitted, the current tip is read and used, matching {@link writeFile}'s
 * same-shaped last-write-wins default.
 */
export async function writeFiles(params: {
	token: string
	location: string
	files: Record<string, string | null>
	expectedVersion?: string | null
	/** Commit message; defaults to `Update <path>` or `Update <n> files`. */
	message?: string
}): Promise<WriteFilesResult> {
	const { owner, repo } = repoLocationOrThrow(params.location)
	const { token } = params

	const metadata = await getRepoMetadata({ token, owner, repo })
	if (!metadata.found) {
		return {
			ok: false,
			status: 404,
			response: new Response(null, { status: 404 }),
		}
	}
	const branch = metadata.metadata.defaultBranch

	let parentCommitSha = params.expectedVersion ?? undefined
	if (parentCommitSha === undefined) {
		const refResponse = await gitDataRequest({
			token,
			owner,
			repo,
			path: `ref/heads/${branch}`,
		})
		if (!refResponse.ok) {
			return { ok: false, status: refResponse.status, response: refResponse }
		}
		const ref = (await refResponse.json()) as { object: { sha: string } }
		parentCommitSha = ref.object.sha
	}

	const commitResponse = await gitDataRequest({
		token,
		owner,
		repo,
		path: `commits/${parentCommitSha}`,
	})
	if (!commitResponse.ok) {
		return {
			ok: false,
			status: commitResponse.status,
			response: commitResponse,
		}
	}
	const parentCommit = (await commitResponse.json()) as {
		tree: { sha: string }
	}

	// A deletion only goes into the tree for a path that exists, matching
	// writeFile's no-op on an absent file: a null entry for a missing path is
	// not something to hand GitHub and hope.
	let paths = Object.entries(params.files)
	if (paths.some(([, content]) => content === null)) {
		const treeResponse = await gitDataRequest({
			token,
			owner,
			repo,
			path: `trees/${parentCommit.tree.sha}?recursive=1`,
		})
		if (!treeResponse.ok) {
			return { ok: false, status: treeResponse.status, response: treeResponse }
		}
		const baseTree = (await treeResponse.json()) as {
			tree: Array<{ path: string }>
			truncated?: boolean
		}
		if (baseTree.truncated !== true) {
			const existing = new Set(baseTree.tree.map((entry) => entry.path))
			paths = paths.filter(
				([path, content]) => content !== null || existing.has(path),
			)
		}
		if (paths.length === 0) return { ok: true }
	}

	// One blob per written (non-deleted) file, in parallel — deletions need no blob.
	const blobShaByPath = new Map<string, string>()
	const blobFailures = await Promise.all(
		paths.map(async ([path, content]) => {
			if (content === null) return null
			const blobResponse = await gitDataRequest({
				token,
				owner,
				repo,
				path: 'blobs',
				method: 'POST',
				body: { content, encoding: 'utf-8' },
			})
			if (!blobResponse.ok) return { path, response: blobResponse }
			const blob = (await blobResponse.json()) as { sha: string }
			blobShaByPath.set(path, blob.sha)
			return null
		}),
	)
	const firstBlobFailure = blobFailures.find((failure) => failure !== null)
	if (firstBlobFailure) {
		return {
			ok: false,
			status: firstBlobFailure.response.status,
			response: firstBlobFailure.response,
		}
	}

	const treeResponse = await gitDataRequest({
		token,
		owner,
		repo,
		path: 'trees',
		method: 'POST',
		body: {
			base_tree: parentCommit.tree.sha,
			tree: paths.map(([path, content]) => {
				if (content === null)
					return { path, mode: '100644', type: 'blob', sha: null }
				const blobSha = blobShaByPath.get(path)
				if (blobSha === undefined) {
					// Every non-deleted path gets a blob above, or this function has
					// already returned on that blob's failure — reaching this means a
					// bug in that pairing, not a GitHub rejection to report as one.
					throw new Error(`No blob was created for ${path}`)
				}
				return { path, mode: '100644', type: 'blob', sha: blobSha }
			}),
		},
	})
	if (!treeResponse.ok) {
		return { ok: false, status: treeResponse.status, response: treeResponse }
	}
	const tree = (await treeResponse.json()) as { sha: string }

	const commitMessage =
		params.message ??
		(paths.length === 1
			? `Update ${paths[0]?.[0]}`
			: `Update ${paths.length} files`)
	const newCommitResponse = await gitDataRequest({
		token,
		owner,
		repo,
		path: 'commits',
		method: 'POST',
		body: {
			message: commitMessage,
			tree: tree.sha,
			parents: [parentCommitSha],
		},
	})
	if (!newCommitResponse.ok) {
		return {
			ok: false,
			status: newCommitResponse.status,
			response: newCommitResponse,
		}
	}
	const newCommit = (await newCommitResponse.json()) as { sha: string }

	const refUpdateResponse = await gitDataRequest({
		token,
		owner,
		repo,
		path: `refs/heads/${branch}`,
		method: 'PATCH',
		body: { sha: newCommit.sha, force: false },
	})
	if (!refUpdateResponse.ok) {
		return {
			ok: false,
			status: refUpdateResponse.status,
			response: refUpdateResponse,
			// GitHub answers a non-fast-forward ref update with 422.
			...(typeof params.expectedVersion === 'string' &&
			refUpdateResponse.status === 422
				? { conflict: true as const }
				: {}),
		}
	}
	return { ok: true }
}

/**
 * The commit at the tip of the repo's default branch: what a later
 * {@link writeFiles} passes as `expectedVersion` so that it only lands on top
 * of the content read after this call.
 */
export async function readHeadCommit(params: {
	token: string
	location: string
}): Promise<{ ok: true; sha: string } | { ok: false; status: number }> {
	const { owner, repo } = repoLocationOrThrow(params.location)
	const metadata = await getRepoMetadata({ token: params.token, owner, repo })
	if (!metadata.found) return { ok: false, status: 404 }
	const refResponse = await gitDataRequest({
		token: params.token,
		owner,
		repo,
		path: `ref/heads/${metadata.metadata.defaultBranch}`,
	})
	if (!refResponse.ok) return { ok: false, status: refResponse.status }
	const ref = (await refResponse.json()) as { object: { sha: string } }
	return { ok: true, sha: ref.object.sha }
}
