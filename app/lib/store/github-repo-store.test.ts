import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
	ForeignRepoError,
	findOrCreateDataRepo,
	getDataRepoName,
	parseRepoLocation,
	REPO_MARKER_CONTENT,
	REPO_MARKER_PATH,
	readFile,
	readFiles,
	writeFile,
	writeFiles,
} from './github-repo-store.ts'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

let previousFetch: typeof fetch | undefined

afterEach(() => {
	if (previousFetch) globalThis.fetch = previousFetch
	previousFetch = undefined
})

function stubFetch(
	handler: (
		input: FetchInput,
		init?: FetchInit,
	) => Response | Promise<Response>,
) {
	previousFetch = globalThis.fetch
	globalThis.fetch = async (input: FetchInput, init?: FetchInit) =>
		handler(input, init)
}

function base64(text: string): string {
	return Buffer.from(text, 'utf-8').toString('base64')
}

function jsonBody(init?: FetchInit): unknown {
	return JSON.parse(String(init?.body))
}

describe('parseRepoLocation', () => {
	it('splits a valid owner/repo location', () => {
		assert.deepEqual(parseRepoLocation('octocat/ainvestor-data'), {
			owner: 'octocat',
			repo: 'ainvestor-data',
		})
	})

	it('rejects a location with no slash', () => {
		assert.equal(parseRepoLocation('octocat'), null)
	})

	it('rejects an empty owner or repo', () => {
		assert.equal(parseRepoLocation('/ainvestor-data'), null)
		assert.equal(parseRepoLocation('octocat/'), null)
	})

	it('rejects more than one slash', () => {
		assert.equal(parseRepoLocation('octocat/ainvestor/data'), null)
	})
})

describe('getDataRepoName', () => {
	it('uses the preview name only on the preview Fly app', () => {
		const previous = process.env.FLY_APP_NAME
		try {
			process.env.FLY_APP_NAME = 'ainvestor-preview'
			assert.equal(getDataRepoName(), 'ainvestor-preview-data')
			process.env.FLY_APP_NAME = 'ainvestor'
			assert.equal(getDataRepoName(), 'ainvestor-data')
			delete process.env.FLY_APP_NAME
			assert.equal(getDataRepoName(), 'ainvestor-data')
		} finally {
			if (previous === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previous
		}
	})
})

describe('readFile', () => {
	it('returns decoded content and the blob sha as version', async () => {
		stubFetch(() => Response.json({ content: base64('[]'), sha: 'blob-sha-1' }))
		const result = await readFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'etfs.json',
		})
		assert.deepEqual(result, {
			ok: true,
			file: { content: '[]', version: 'blob-sha-1' },
		})
	})

	it('decodes base64 content that GitHub line-wraps every 60 chars', async () => {
		const long = JSON.stringify({ a: 'x'.repeat(100) })
		const wrapped = base64(long).replace(/(.{20})/g, '$1\n')
		stubFetch(() => Response.json({ content: wrapped, sha: 's' }))
		const result = await readFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'x.json',
		})
		assert.equal(result.ok, true)
		assert.equal(result.ok && result.file?.content, long)
	})

	it('falls back to the git blob when the Contents API omits inline content for a large file', async () => {
		let sawBlobRequest = false
		stubFetch((input) => {
			const url = String(input)
			if (url.endsWith('/contents/catalog.json')) {
				return Response.json({ content: '', encoding: 'none', sha: 'big-sha' })
			}
			if (url.endsWith('/git/blobs/big-sha')) {
				sawBlobRequest = true
				return Response.json({
					content: base64('[]'),
					encoding: 'base64',
					sha: 'big-sha',
				})
			}
			throw new Error(`unexpected request: ${url}`)
		})
		const result = await readFile({
			token: 'token',
			location: 'octocat/ainvestor-catalog',
			path: 'catalog.json',
		})
		assert.equal(sawBlobRequest, true)
		assert.deepEqual(result, {
			ok: true,
			file: { content: '[]', version: 'big-sha' },
		})
	})

	it('returns file: null for a 404 (absent file)', async () => {
		stubFetch(() => new Response(null, { status: 404 }))
		const result = await readFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'missing.json',
		})
		assert.deepEqual(result, { ok: true, file: null })
	})

	it('returns ok: false with the status on a rejected read', async () => {
		stubFetch(() => new Response(null, { status: 403 }))
		const result = await readFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'etfs.json',
		})
		assert.deepEqual(result, { ok: false, status: 403 })
	})

	it('throws when the path is a directory, not a file', async () => {
		stubFetch(() => Response.json([{ name: 'a.json' }, { name: 'b.json' }]))
		await assert.rejects(
			readFile({
				token: 'token',
				location: 'octocat/ainvestor-data',
				path: 'some-dir',
			}),
			/not a file/,
		)
	})

	it('sends the bearer token', async () => {
		let authHeader: string | null = null
		stubFetch((_input, init) => {
			authHeader = new Headers(init?.headers).get('Authorization')
			return Response.json({ content: base64('{}'), sha: 's' })
		})
		await readFile({
			token: 'my-token',
			location: 'octocat/ainvestor-data',
			path: 'x.json',
		})
		assert.equal(authHeader, 'Bearer my-token')
	})
})

describe('readFiles', () => {
	it('reads several paths, one request per path', async () => {
		let requestCount = 0
		stubFetch((input) => {
			requestCount += 1
			const url = String(input)
			if (url.endsWith('/a.json')) {
				return Response.json({ content: base64('{"a":1}'), sha: 'sha-a' })
			}
			if (url.endsWith('/b.json')) return new Response(null, { status: 404 })
			throw new Error(`unexpected request: ${url}`)
		})
		const result = await readFiles({
			token: 'token',
			location: 'octocat/ainvestor-data',
			paths: ['a.json', 'b.json'],
		})
		assert.equal(requestCount, 2)
		assert.deepEqual(result, {
			ok: true,
			files: {
				'a.json': { content: '{"a":1}', version: 'sha-a' },
				'b.json': null,
			},
		})
	})

	it('surfaces the first rejected read', async () => {
		stubFetch((input) => {
			const url = String(input)
			if (url.endsWith('/a.json')) return new Response(null, { status: 500 })
			return Response.json({ content: base64('{}'), sha: 's' })
		})
		const result = await readFiles({
			token: 'token',
			location: 'octocat/ainvestor-data',
			paths: ['a.json', 'b.json'],
		})
		assert.deepEqual(result, { ok: false, status: 500 })
	})
})

describe('writeFile', () => {
	it('creates a new file without a sha when none exists yet', async () => {
		let putBody: unknown
		stubFetch((_input, init) => {
			if (init?.method === undefined || init.method === 'GET') {
				return new Response(null, { status: 404 })
			}
			putBody = jsonBody(init)
			return Response.json({ content: { sha: 'new-sha' } })
		})
		const result = await writeFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'etfs.json',
			content: '[]',
		})
		assert.deepEqual(result, { ok: true, version: 'new-sha' })
		assert.deepEqual(putBody, {
			message: 'Update etfs.json',
			content: base64('[]'),
		})
	})

	it('reads the current sha first when updating without expectedVersion', async () => {
		let getCount = 0
		let putBody: unknown
		stubFetch((_input, init) => {
			if (init?.method === undefined || init.method === 'GET') {
				getCount += 1
				return Response.json({ content: base64('["old"]'), sha: 'old-sha' })
			}
			putBody = jsonBody(init)
			return Response.json({ content: { sha: 'new-sha' } })
		})
		const result = await writeFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'etfs.json',
			content: '["new"]',
		})
		assert.equal(getCount, 1)
		assert.deepEqual(result, { ok: true, version: 'new-sha' })
		assert.deepEqual(putBody, {
			message: 'Update etfs.json',
			content: base64('["new"]'),
			sha: 'old-sha',
		})
	})

	it('skips the read and uses expectedVersion directly when given', async () => {
		let requestCount = 0
		let putBody: unknown
		stubFetch((_input, init) => {
			requestCount += 1
			putBody = jsonBody(init)
			return Response.json({ content: { sha: 'new-sha' } })
		})
		const result = await writeFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'etfs.json',
			content: '["new"]',
			expectedVersion: 'known-sha',
		})
		assert.equal(requestCount, 1, 'no GET before the PUT')
		assert.deepEqual(result, { ok: true, version: 'new-sha' })
		assert.deepEqual(putBody, {
			message: 'Update etfs.json',
			content: base64('["new"]'),
			sha: 'known-sha',
		})
	})

	it('deletes an existing file, sending its current sha', async () => {
		let deleteBody: unknown
		stubFetch((_input, init) => {
			if (init?.method === undefined || init.method === 'GET') {
				return Response.json({ content: base64('[]'), sha: 'current-sha' })
			}
			deleteBody = jsonBody(init)
			return new Response(null, { status: 200 })
		})
		const result = await writeFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'advice-buy-next.json',
			content: null,
		})
		assert.equal(result.ok, true)
		assert.deepEqual(deleteBody, {
			message: 'Remove advice-buy-next.json',
			sha: 'current-sha',
		})
	})

	it('treats deleting an already-absent file as a no-op success', async () => {
		let requestCount = 0
		stubFetch(() => {
			requestCount += 1
			return new Response(null, { status: 404 })
		})
		const result = await writeFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'advice-buy-next.json',
			content: null,
		})
		assert.deepEqual(result, { ok: true, version: '' })
		assert.equal(requestCount, 1, 'only the existence check, no DELETE')
	})

	it('returns ok: false with the status and response on a rejected write', async () => {
		stubFetch((_input, init) => {
			if (init?.method === undefined || init.method === 'GET') {
				return new Response(null, { status: 404 })
			}
			return new Response('sha mismatch', { status: 409 })
		})
		const result = await writeFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'etfs.json',
			content: '[]',
			expectedVersion: 'stale-sha',
		})
		assert.equal(result.ok, false)
		if (result.ok) throw new Error('unreachable')
		assert.equal(result.status, 409)
		assert.equal(await result.response.text(), 'sha mismatch')
	})

	it('surfaces a rejected sha lookup rather than writing blind', async () => {
		let putRequested = false
		stubFetch((_input, init) => {
			if (init?.method === undefined || init.method === 'GET') {
				return new Response(null, { status: 403 })
			}
			putRequested = true
			return Response.json({ content: { sha: 'new-sha' } })
		})
		const result = await writeFile({
			token: 'token',
			location: 'octocat/ainvestor-data',
			path: 'etfs.json',
			content: '[]',
		})
		assert.equal(result.ok, false)
		if (result.ok) throw new Error('unreachable')
		assert.equal(result.status, 403)
		assert.equal(putRequested, false, 'must not write without knowing the sha')
	})
})

describe('findOrCreateDataRepo', () => {
	it('returns the existing repo location when it carries the ownership marker', async () => {
		let createRequested = false
		stubFetch((input) => {
			const url = String(input)
			if (url.endsWith('/repos/octocat/ainvestor-data')) {
				return Response.json({ default_branch: 'main' })
			}
			if (url.endsWith(`/contents/${REPO_MARKER_PATH}`)) {
				return Response.json({ content: base64(REPO_MARKER_CONTENT), sha: 's' })
			}
			if (url.endsWith('/user/repos')) {
				createRequested = true
				return Response.json({}, { status: 201 })
			}
			throw new Error(`unexpected request: ${url}`)
		})
		const location = await findOrCreateDataRepo({
			token: 'token',
			login: 'octocat',
		})
		assert.equal(location, 'octocat/ainvestor-data')
		assert.equal(createRequested, false)
	})

	it('refuses an existing repo with no ownership marker', async () => {
		stubFetch((input) => {
			const url = String(input)
			if (url.endsWith('/repos/octocat/ainvestor-data')) {
				return Response.json({ default_branch: 'main' })
			}
			if (url.endsWith(`/contents/${REPO_MARKER_PATH}`)) {
				return new Response(null, { status: 404 })
			}
			throw new Error(`unexpected request: ${url}`)
		})
		await assert.rejects(
			findOrCreateDataRepo({ token: 'token', login: 'octocat' }),
			ForeignRepoError,
		)
	})

	it('does not report a foreign repo when the marker check merely fails transiently', async () => {
		stubFetch((input) => {
			const url = String(input)
			if (url.endsWith('/repos/octocat/ainvestor-data')) {
				return Response.json({ default_branch: 'main' })
			}
			if (url.endsWith(`/contents/${REPO_MARKER_PATH}`)) {
				return new Response(null, { status: 503 })
			}
			throw new Error(`unexpected request: ${url}`)
		})
		await assert.rejects(
			findOrCreateDataRepo({ token: 'token', login: 'octocat' }),
			(error: unknown) => {
				assert.ok(!(error instanceof ForeignRepoError))
				assert.match(String(error), /503/)
				return true
			},
		)
	})

	it('creates the repo and writes the marker when none exists', async () => {
		let createBody: unknown
		let markerPutBody: unknown
		stubFetch((input, init) => {
			const url = String(input)
			const method = init?.method ?? 'GET'
			if (method === 'GET' && url.endsWith('/repos/octocat/ainvestor-data')) {
				return new Response(null, { status: 404 })
			}
			if (method === 'POST' && url.endsWith('/user/repos')) {
				createBody = jsonBody(init)
				return Response.json({}, { status: 201 })
			}
			if (method === 'GET' && url.endsWith(`/contents/${REPO_MARKER_PATH}`)) {
				return new Response(null, { status: 404 }) // no marker yet — this write is creating it
			}
			if (method === 'PUT' && url.endsWith(`/contents/${REPO_MARKER_PATH}`)) {
				markerPutBody = jsonBody(init)
				return Response.json({ content: { sha: 'marker-sha' } })
			}
			throw new Error(`unexpected request: ${method} ${url}`)
		})
		const location = await findOrCreateDataRepo({
			token: 'token',
			login: 'octocat',
		})
		assert.equal(location, 'octocat/ainvestor-data')
		assert.deepEqual(createBody, {
			name: 'ainvestor-data',
			private: true,
			auto_init: true,
			description: 'Private data store for the AI Investor app.',
		})
		assert.deepEqual(markerPutBody, {
			message: `Update ${REPO_MARKER_PATH}`,
			content: base64(REPO_MARKER_CONTENT),
		})
	})

	it('throws when repo creation itself fails', async () => {
		stubFetch((input, init) => {
			const url = String(input)
			const method = init?.method ?? 'GET'
			if (method === 'GET' && url.endsWith('/repos/octocat/ainvestor-data')) {
				return new Response(null, { status: 404 })
			}
			if (method === 'POST' && url.endsWith('/user/repos')) {
				return new Response(null, { status: 422 })
			}
			throw new Error(`unexpected request: ${method} ${url}`)
		})
		await assert.rejects(
			findOrCreateDataRepo({ token: 'token', login: 'octocat' }),
			/422/,
		)
	})
})

describe('writeFiles', () => {
	function stubGitDataSequence(params: {
		defaultBranch?: string
		onBlobCreated?: (content: string) => void
		onTreeRequested?: (body: {
			base_tree: string
			tree: Array<{ path: string; sha: string | null }>
		}) => void
	}) {
		const branch = params.defaultBranch ?? 'main'
		stubFetch((input, init) => {
			const url = String(input)
			const method = init?.method ?? 'GET'
			if (method === 'GET' && !url.includes('/git/')) {
				return Response.json({ default_branch: branch })
			}
			if (method === 'GET' && url.endsWith(`/git/ref/heads/${branch}`)) {
				return Response.json({ object: { sha: 'parent-commit-sha' } })
			}
			if (method === 'GET' && url.endsWith('/git/commits/parent-commit-sha')) {
				return Response.json({ tree: { sha: 'parent-tree-sha' } })
			}
			if (method === 'POST' && url.endsWith('/git/blobs')) {
				const body = jsonBody(init) as { content: string }
				params.onBlobCreated?.(body.content)
				return Response.json({ sha: `blob-sha-${body.content.length}` })
			}
			if (method === 'POST' && url.endsWith('/git/trees')) {
				const body = jsonBody(init) as {
					base_tree: string
					tree: Array<{ path: string; sha: string | null }>
				}
				params.onTreeRequested?.(body)
				return Response.json({ sha: 'new-tree-sha' })
			}
			if (method === 'POST' && url.endsWith('/git/commits')) {
				return Response.json({ sha: 'new-commit-sha' })
			}
			if (method === 'PATCH' && url.endsWith(`/git/refs/heads/${branch}`)) {
				return Response.json({ object: { sha: 'new-commit-sha' } })
			}
			throw new Error(`unexpected request: ${method} ${url}`)
		})
	}

	it('writes several files in one commit', async () => {
		let treeBody:
			| { base_tree: string; tree: Array<{ path: string; sha: string | null }> }
			| undefined
		stubGitDataSequence({
			onTreeRequested: (body) => {
				treeBody = body
			},
		})
		const result = await writeFiles({
			token: 'token',
			location: 'octocat/ainvestor-catalog',
			files: {
				'catalog.json': '[]',
				'catalog-source.json': '{}',
			},
		})
		assert.deepEqual(result, { ok: true })
		assert.equal(treeBody?.base_tree, 'parent-tree-sha')
		assert.equal(treeBody?.tree.length, 2)
		assert.ok(treeBody?.tree.every((entry) => typeof entry.sha === 'string'))
	})

	it('deletes a file within a multi-file write using a null tree entry', async () => {
		let treeBody:
			| { tree: Array<{ path: string; sha: string | null }> }
			| undefined
		stubGitDataSequence({
			onTreeRequested: (body) => {
				treeBody = body
			},
		})
		const result = await writeFiles({
			token: 'token',
			location: 'octocat/ainvestor-data',
			files: {
				'advice-analysis.json': null,
				'advice-buy-next.json': null,
				'advice-portfolio-review.json': null,
			},
		})
		assert.deepEqual(result, { ok: true })
		assert.equal(treeBody?.tree.length, 3)
		assert.ok(treeBody?.tree.every((entry) => entry.sha === null))
	})

	it('respects a non-default branch name', async () => {
		let sawBranchRef = false
		stubGitDataSequence({ defaultBranch: 'trunk' })
		const priorFetch = globalThis.fetch
		globalThis.fetch = async (input, init) => {
			if (String(input).includes('/git/ref/heads/trunk')) sawBranchRef = true
			return priorFetch(input, init)
		}
		try {
			const result = await writeFiles({
				token: 'token',
				location: 'octocat/ainvestor-data',
				files: { 'x.json': '{}' },
			})
			assert.equal(result.ok, true)
			assert.equal(sawBranchRef, true)
		} finally {
			globalThis.fetch = priorFetch
		}
	})

	it('skips reading the ref when expectedVersion is given', async () => {
		let sawRefRequest = false
		stubGitDataSequence({})
		const priorFetch = globalThis.fetch
		globalThis.fetch = async (input, init) => {
			if (String(input).includes('/git/ref/heads/')) sawRefRequest = true
			return priorFetch(input, init)
		}
		try {
			const result = await writeFiles({
				token: 'token',
				location: 'octocat/ainvestor-data',
				files: { 'x.json': '{}' },
				expectedVersion: 'parent-commit-sha',
			})
			assert.equal(result.ok, true)
			assert.equal(sawRefRequest, false)
		} finally {
			globalThis.fetch = priorFetch
		}
	})

	it('returns ok: false when the repo does not exist', async () => {
		stubFetch(() => new Response(null, { status: 404 }))
		const result = await writeFiles({
			token: 'token',
			location: 'octocat/does-not-exist',
			files: { 'x.json': '{}' },
		})
		assert.equal(result.ok, false)
		if (result.ok) throw new Error('unreachable')
		assert.equal(result.status, 404)
	})

	it('surfaces a rejected ref update (a non-fast-forward push) as failure', async () => {
		stubFetch((input, init) => {
			const url = String(input)
			const method = init?.method ?? 'GET'
			if (method === 'GET' && !url.includes('/git/')) {
				return Response.json({ default_branch: 'main' })
			}
			if (method === 'GET' && url.endsWith('/git/ref/heads/main')) {
				return Response.json({ object: { sha: 'parent-commit-sha' } })
			}
			if (method === 'GET' && url.endsWith('/git/commits/parent-commit-sha')) {
				return Response.json({ tree: { sha: 'parent-tree-sha' } })
			}
			if (method === 'POST' && url.endsWith('/git/blobs')) {
				return Response.json({ sha: 'blob-sha' })
			}
			if (method === 'POST' && url.endsWith('/git/trees')) {
				return Response.json({ sha: 'new-tree-sha' })
			}
			if (method === 'POST' && url.endsWith('/git/commits')) {
				return Response.json({ sha: 'new-commit-sha' })
			}
			if (method === 'PATCH' && url.endsWith('/git/refs/heads/main')) {
				return new Response('Update is not a fast forward', { status: 422 })
			}
			throw new Error(`unexpected request: ${method} ${url}`)
		})
		const result = await writeFiles({
			token: 'token',
			location: 'octocat/ainvestor-data',
			files: { 'x.json': '{}' },
		})
		assert.equal(result.ok, false)
		if (result.ok) throw new Error('unreachable')
		assert.equal(result.status, 422)
	})
})
