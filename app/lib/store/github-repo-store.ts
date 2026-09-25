/**
 * Repository-backed implementation of the storage port's contract — the same
 * four operations `github-store.ts` provides over gists, over a private
 * GitHub repository instead. See Phase 2 in `docs/STORAGE_MIGRATION_PLAN.md`.
 *
 * **Not wired into anything yet.** No caller in `app/` or `mcp/` reaches it.
 * The Phase 3 migration script is its first user; the Phase 4 cutover then
 * points the per-user data modules at it directly, replacing the gist backend
 * for them in one deploy — there is no dispatcher between the two.
 *
 * `location` is `"owner/repo"` here (a gist id in the gist backend) — one
 * string works for both because a GitHub login or repo name can never
 * contain `/`, so the split is unambiguous. {@link parseRepoLocation} is the
 * only place that needs to know this.
 *
 * The two backends' write contracts do not match, which is most of why this
 * module is larger than `github-store.ts`:
 *
 * - A gist PATCH has no version concept; GitHub silently overwrites. A repo
 *   file update always requires the blob's current `sha` — there is no
 *   "just overwrite" option on the Contents API. When a caller does not
 *   supply `expectedVersion` (every caller today — Phase 5 is what starts
 *   threading it through), {@link writeFile} reads the current `sha` itself
 *   first, matching gists' last-write-wins behavior. Once a caller does
 *   supply one, GitHub's own rejection of a stale `sha` *is* the
 *   compare-and-swap signal Phase 5 wants — nothing extra to build here.
 * - A multi-file atomic write has no PATCH equivalent: it is a five-request
 *   Git Data sequence (read the branch ref, read its commit, create a blob
 *   per changed file, create a tree layering those blobs on the current one,
 *   create a commit, then update the ref non-fast-forward — which is where
 *   the atomicity comes from: a ref that moved since we read it rejects the
 *   update instead of silently losing a concurrent write).
 * - A multi-file *read* has no bundled-response shortcut: gists return every
 *   file in one payload; repos have no equivalent for arbitrary paths, so
 *   {@link readFiles} costs one request per path (parallelized, but still
 *   one each against the rate limit).
 *
 * Every {@link StoredFile} here carries the real blob `sha` as `version` from
 * day one, even though nothing consumes it until Phase 5.
 */

import { isPreview } from '../gist.ts'
import {
	GITHUB_API,
	GITHUB_REQUEST_TIMEOUT_MS,
	githubHeaders,
	type StoredFile,
} from './github-store.ts'

/** The private data repo's fixed name, mirroring `getGistDescription()`'s preview split. */
export function getDataRepoName(): string {
	return isPreview() ? 'ainvestor-preview-data' : 'ainvestor-data'
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
 * Finds the caller's data repo, or creates it. Returns its `location`
 * (`"owner/repo"`). Never returns a repo without the ownership marker —
 * throws {@link ForeignRepoError} instead.
 *
 * Unlike `findOrCreateGist`, this never pages a list looking for a match:
 * the repo name is fixed and deterministic, so one `GET` on the known
 * `owner/name` either finds it or doesn't.
 */
export async function findOrCreateDataRepo(params: {
	token: string
	login: string
}): Promise<string> {
	const { token, login } = params
	const repoName = getDataRepoName()
	const existing = await getRepoMetadata({
		token,
		owner: login,
		repo: repoName,
	})

	if (existing.found) {
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
		throw new Error(
			`GitHub API error writing ownership marker: ${markerWrite.status}`,
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
 * content for a file over ~1MB (`content: ''`, `encoding: 'none'`) — the same
 * truncation problem `github-store.ts`'s `readFullFileContent` works around
 * for gists via `raw_url`. The Git Data blob endpoint has no such limit until
 * 100MB, and every {@link getContentsFile} response already carries the sha
 * this needs, so no extra lookup is required.
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
 * since the Contents API has no bundled-multi-file response the way a gist
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

export type WriteFileResult =
	| { ok: true; version: string }
	| { ok: false; status: number; response: Response }

/**
 * Writes or deletes one file. `content: null` deletes it (a no-op success if
 * it was already absent, matching the gist backend's convention).
 *
 * When `expectedVersion` is omitted, reads the file's current `sha` first so
 * the write can succeed at all — the Contents API rejects an update with no
 * `sha`. This is not compare-and-swap (the read-then-write is not atomic
 * against a concurrent writer); it exists only to match gists' current
 * last-write-wins behavior. Passing `expectedVersion` skips that read and
 * uses it directly, and it is GitHub's own stale-`sha` rejection that then
 * gives Phase 5 real compare-and-swap — nothing else changes.
 */
export async function writeFile(params: {
	token: string
	location: string
	path: string
	content: string | null
	expectedVersion?: string | null
}): Promise<WriteFileResult> {
	const { owner, repo } = repoLocationOrThrow(params.location)
	const url = contentsUrl({ owner, repo, path: params.path })

	let sha = params.expectedVersion ?? undefined
	if (sha === undefined) {
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
			body: JSON.stringify({ message: `Remove ${params.path}`, sha }),
		})
		if (!response.ok) return { ok: false, status: response.status, response }
		return { ok: true, version: '' }
	}

	const response = await fetch(url, {
		method: 'PUT',
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(params.token),
		body: JSON.stringify({
			message: `Update ${params.path}`,
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

type GitDataFailure = { ok: false; status: number; response: Response }

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
 * `expectedVersion` names the parent commit to build on; when omitted, the
 * current tip is read and used, matching {@link writeFile}'s same-shaped
 * last-write-wins default.
 */
export async function writeFiles(params: {
	token: string
	location: string
	files: Record<string, string | null>
	expectedVersion?: string | null
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

	// One blob per written (non-deleted) file, in parallel — deletions need no blob.
	const paths = Object.entries(params.files)
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
		paths.length === 1
			? `Update ${paths[0]?.[0]}`
			: `Update ${paths.length} files`
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
		}
	}
	return { ok: true }
}
