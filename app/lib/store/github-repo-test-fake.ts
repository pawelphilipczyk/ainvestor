/**
 * Test helper: an in-memory stand-in for the slice of the GitHub API that
 * `github-repo-store.ts` and the MCP repo lookup use — enough that a test can
 * seed a data repo, run real code against it, and assert on the files that
 * end up there rather than on request bodies.
 *
 * It replaces `globalThis.fetch`; the caller restores it (every suite using
 * it already saves and restores `fetch` around each case).
 */
import { REPO_MARKER_CONTENT, REPO_MARKER_PATH } from './github-repo-store.ts'

export type FakeDataRepo = {
	/** The repo's files by path, the ownership marker included. */
	files: Map<string, string>
	/** Every request as `METHOD /path` (query string dropped). */
	requests: string[]
	/** The message of every commit made, oldest first. */
	commitMessages: string[]
	/**
	 * Another client writing `path` behind the caller's back: the content
	 * changes and the file gets a new version, so a write holding the old one
	 * is stale.
	 */
	externalWrite(path: string, content: string): void
	/** Another client deleting `path` behind the caller's back. */
	externalDelete(path: string): void
}

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

export function installFakeDataRepo(
	options: {
		login?: string
		repoName?: string
		files?: Record<string, string>
		/** Answer every request with this status, for error-path tests. */
		failWith?: number
		/** Answer only writes (non-GET) with this status. */
		failWritesWith?: number
		/** Answer only file reads (`GET …/contents/…`) with this status. */
		failContentReadsWith?: number
		/** Leave out the ownership marker: a same-named repo this app did not create. */
		unmarked?: boolean
		/** The repo does not exist yet: every request to it answers 404. */
		absent?: boolean
		/** `X-OAuth-Scopes` on `GET /user`; omitted, as a fine-grained token does. */
		scopes?: string
		/** `permissions.push` on the repo itself: whether this token may write it. Defaults to true. */
		canWrite?: boolean
		/** Runs after a file read (`GET …/contents/…`) is answered, whether or not the file exists — where a test slips in a concurrent write. */
		afterContentRead?: (path: string, repo: FakeDataRepo) => void
	} = {},
): FakeDataRepo {
	const login = options.login ?? 'octocat'
	const repoName = options.repoName ?? 'ainvestor-data'
	const state: FakeDataRepo = {
		files: new Map([
			...(options.unmarked
				? []
				: ([[REPO_MARKER_PATH, REPO_MARKER_CONTENT]] as const)),
			...Object.entries(options.files ?? {}),
		]),
		requests: [],
		commitMessages: [],
		externalWrite: (path, content) => {
			state.files.set(path, content)
			shas.set(path, nextSha())
		},
		externalDelete: (path) => {
			state.files.delete(path)
			shas.delete(path)
		},
	}
	// Each file's version, replaced on every write like a blob's sha: a write
	// that names an older one is refused the way GitHub refuses it.
	const shas = new Map<string, string>()
	let shaCounter = 0
	const nextSha = () => `sha-${++shaCounter}`
	const currentSha = (filePath: string) => {
		let sha = shas.get(filePath)
		if (sha === undefined) {
			sha = nextSha()
			shas.set(filePath, sha)
		}
		return sha
	}
	const blobs = new Map<string, string>()
	let pendingTree: Array<{ path: string; sha: string | null }> = []
	const repoPrefix = `/repos/${login}/${repoName}`

	globalThis.fetch = async (input: FetchInput, init?: FetchInit) => {
		const url = new URL(String(input))
		const method = init?.method ?? 'GET'
		const path = url.pathname
		state.requests.push(`${method} ${path}`)
		if (options.failWith !== undefined) {
			return new Response(null, { status: options.failWith })
		}
		if (method !== 'GET' && options.failWritesWith !== undefined) {
			return new Response(null, { status: options.failWritesWith })
		}
		const body =
			typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
		const notFound = () => new Response(null, { status: 404 })

		if (method === 'GET' && path === '/user') {
			return Response.json(
				{ login },
				options.scopes === undefined
					? {}
					: { headers: { 'x-oauth-scopes': options.scopes } },
			)
		}
		if (options.absent && path.startsWith(repoPrefix)) return notFound()
		if (method === 'GET' && path === repoPrefix) {
			return Response.json({
				default_branch: 'main',
				permissions: { pull: true, push: options.canWrite ?? true },
			})
		}
		if (path.startsWith(`${repoPrefix}/contents/`)) {
			const filePath = path.slice(`${repoPrefix}/contents/`.length)
			const current = state.files.get(filePath)
			if (method === 'GET' && options.failContentReadsWith !== undefined) {
				return new Response(null, { status: options.failContentReadsWith })
			}
			if (method === 'GET') {
				if (current === undefined) {
					const response = notFound()
					options.afterContentRead?.(filePath, state)
					return response
				}
				const response = Response.json({
					content: Buffer.from(current, 'utf-8').toString('base64'),
					encoding: 'base64',
					sha: currentSha(filePath),
				})
				options.afterContentRead?.(filePath, state)
				return response
			}
			if (method === 'PUT') {
				// GitHub: an existing file needs its current sha (422 when missing),
				// and a stale one is a 409. So is a sha for a file that is gone.
				if (current === undefined && body.sha !== undefined) {
					return new Response(null, { status: 409 })
				}
				if (current !== undefined) {
					if (body.sha === undefined) return new Response(null, { status: 422 })
					if (body.sha !== currentSha(filePath)) {
						return new Response(null, { status: 409 })
					}
				}
				state.commitMessages.push(body.message)
				state.files.set(
					filePath,
					Buffer.from(body.content, 'base64').toString('utf-8'),
				)
				const sha = nextSha()
				shas.set(filePath, sha)
				return Response.json({ content: { sha } })
			}
			if (method === 'DELETE') {
				if (current === undefined) return notFound()
				if (body.sha !== currentSha(filePath)) {
					return new Response(null, { status: 409 })
				}
				state.commitMessages.push(body.message)
				state.files.delete(filePath)
				shas.delete(filePath)
				return Response.json({})
			}
		}
		if (method === 'GET' && path === `${repoPrefix}/git/ref/heads/main`) {
			return Response.json({ object: { sha: 'commit-0' } })
		}
		if (method === 'GET' && path.startsWith(`${repoPrefix}/git/commits/`)) {
			return Response.json({ tree: { sha: 'tree-0' } })
		}
		if (method === 'GET' && path.startsWith(`${repoPrefix}/git/trees/`)) {
			return Response.json({
				tree: [...state.files.keys()].map((name) => ({
					path: name,
					type: 'blob',
				})),
			})
		}
		if (method === 'POST' && path === `${repoPrefix}/git/blobs`) {
			const sha = `blob-${blobs.size + 1}`
			blobs.set(sha, body.content)
			return Response.json({ sha })
		}
		if (method === 'POST' && path === `${repoPrefix}/git/trees`) {
			pendingTree = body.tree
			return Response.json({ sha: 'tree-1' })
		}
		if (method === 'POST' && path === `${repoPrefix}/git/commits`) {
			state.commitMessages.push(body.message)
			return Response.json({ sha: 'commit-1' })
		}
		if (method === 'PATCH' && path === `${repoPrefix}/git/refs/heads/main`) {
			for (const entry of pendingTree) {
				if (entry.sha === null) {
					state.files.delete(entry.path)
					shas.delete(entry.path)
				} else {
					state.files.set(entry.path, blobs.get(entry.sha) ?? '')
					shas.set(entry.path, nextSha())
				}
			}
			return Response.json({ object: { sha: 'commit-1' } })
		}
		throw new Error(
			`unexpected request to the fake data repo: ${method} ${path}`,
		)
	}
	return state
}
