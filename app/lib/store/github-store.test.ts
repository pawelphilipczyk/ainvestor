import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
	githubHeaders,
	readFile,
	readFiles,
	writeFile,
	writeFiles,
} from './github-store.ts'

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

describe('githubHeaders', () => {
	it('carries the bearer token and API version', () => {
		const headers = githubHeaders('a-token') as Record<string, string>
		assert.equal(headers.Authorization, 'Bearer a-token')
		assert.equal(headers['X-GitHub-Api-Version'], '2022-11-28')
	})
})

describe('readFile', () => {
	it('returns the file content and null version', async () => {
		stubFetch(() =>
			Response.json({ files: { 'etfs.json': { content: '[]' } } }),
		)
		const result = await readFile({
			token: 'token',
			location: 'gist-1',
			path: 'etfs.json',
		})
		assert.deepEqual(result, {
			ok: true,
			file: { content: '[]', version: null },
			owner: null,
		})
	})

	it('returns file: null for a path absent from the gist', async () => {
		stubFetch(() => Response.json({ files: {} }))
		const result = await readFile({
			token: 'token',
			location: 'gist-1',
			path: 'missing.json',
		})
		assert.deepEqual(result, { ok: true, file: null, owner: null })
	})

	it('returns file: null when content is empty', async () => {
		stubFetch(() =>
			Response.json({ files: { 'etfs.json': { content: null } } }),
		)
		const result = await readFile({
			token: 'token',
			location: 'gist-1',
			path: 'etfs.json',
		})
		assert.deepEqual(result, { ok: true, file: null, owner: null })
	})

	it('surfaces the owner login', async () => {
		stubFetch(() =>
			Response.json({ files: {}, owner: { login: 'catalog-admin' } }),
		)
		const result = await readFile({
			token: null,
			location: 'gist-1',
			path: 'catalog.json',
		})
		assert.deepEqual(result, { ok: true, file: null, owner: 'catalog-admin' })
	})

	it('returns ok: false with the status on a rejected read', async () => {
		stubFetch(() => new Response(null, { status: 404 }))
		const result = await readFile({
			token: 'token',
			location: 'gist-1',
			path: 'etfs.json',
		})
		assert.deepEqual(result, { ok: false, status: 404 })
	})

	it('reads anonymously when token is null, and sends no Authorization header', async () => {
		let sawAuthHeader = false
		stubFetch((_input, init) => {
			const headers = new Headers(init?.headers)
			sawAuthHeader = headers.has('Authorization')
			return Response.json({ files: {} })
		})
		await readFile({ token: null, location: 'gist-1', path: 'catalog.json' })
		assert.equal(sawAuthHeader, false)
	})

	it('sends the bearer token when given one', async () => {
		let authHeader: string | null = null
		stubFetch((_input, init) => {
			authHeader = new Headers(init?.headers).get('Authorization')
			return Response.json({ files: {} })
		})
		await readFile({ token: 'my-token', location: 'gist-1', path: 'x.json' })
		assert.equal(authHeader, 'Bearer my-token')
	})

	it('downloads truncated content from raw_url instead of the truncated field', async () => {
		stubFetch((input) => {
			const url = String(input)
			if (url.includes('raw_url_host')) {
				return new Response('full content')
			}
			return Response.json({
				files: {
					'catalog.json': {
						content: 'this is truncated...',
						truncated: true,
						raw_url: 'https://raw_url_host/catalog.json',
					},
				},
			})
		})
		const result = await readFile({
			token: null,
			location: 'gist-1',
			path: 'catalog.json',
		})
		assert.deepEqual(result, {
			ok: true,
			file: { content: 'full content', version: null },
			owner: null,
		})
	})

	it('treats null content with no truncated flag as no content, even when raw_url is present', async () => {
		// Pins the deliberate normalization documented on readFullFileContent:
		// null content alone is never a reason to fetch raw_url, or every reader
		// that used to treat "no file" as empty (not an error) would start
		// throwing whenever raw_url happens to be present.
		let rawUrlFetched = false
		stubFetch((input) => {
			const url = String(input)
			if (url.includes('raw_url_host')) {
				rawUrlFetched = true
				return new Response('should not be fetched')
			}
			return Response.json({
				files: {
					'x.json': {
						content: null,
						raw_url: 'https://raw_url_host/x.json',
					},
				},
			})
		})
		const result = await readFile({
			token: null,
			location: 'gist-1',
			path: 'x.json',
		})
		assert.deepEqual(result, { ok: true, file: null, owner: null })
		assert.equal(rawUrlFetched, false)
	})

	it('throws when a truncated file has no raw_url', async () => {
		stubFetch(() =>
			Response.json({
				files: { 'x.json': { content: 'partial', truncated: true } },
			}),
		)
		await assert.rejects(
			readFile({ token: null, location: 'gist-1', path: 'x.json' }),
			/no raw_url/,
		)
	})

	it('throws when the raw_url download itself fails', async () => {
		stubFetch((input) => {
			const url = String(input)
			if (url.includes('raw_url_host'))
				return new Response(null, { status: 500 })
			return Response.json({
				files: {
					'x.json': {
						content: 'partial',
						truncated: true,
						raw_url: 'https://raw_url_host/x.json',
					},
				},
			})
		})
		await assert.rejects(
			readFile({ token: null, location: 'gist-1', path: 'x.json' }),
			/Could not download gist file: 500/,
		)
	})
})

describe('readFiles', () => {
	it('reads several paths from one gist in a single request', async () => {
		let requestCount = 0
		stubFetch(() => {
			requestCount += 1
			return Response.json({
				files: {
					'a.json': { content: '{"a":1}' },
					'b.json': { content: '{"b":2}' },
				},
			})
		})
		const result = await readFiles({
			token: 'token',
			location: 'gist-1',
			paths: ['a.json', 'b.json', 'missing.json'],
		})
		assert.equal(requestCount, 1)
		assert.deepEqual(result, {
			ok: true,
			owner: null,
			files: {
				'a.json': { content: '{"a":1}', version: null },
				'b.json': { content: '{"b":2}', version: null },
				'missing.json': null,
			},
		})
	})

	it('resolves several truncated files concurrently, not one after another', async () => {
		let inFlight = 0
		let maxInFlight = 0
		stubFetch(async (input) => {
			const url = String(input)
			if (!url.includes('raw_url_host')) {
				return Response.json({
					files: {
						'a.json': {
							content: 'truncated-a',
							truncated: true,
							raw_url: 'https://raw_url_host/a.json',
						},
						'b.json': {
							content: 'truncated-b',
							truncated: true,
							raw_url: 'https://raw_url_host/b.json',
						},
					},
				})
			}
			inFlight += 1
			maxInFlight = Math.max(maxInFlight, inFlight)
			// Yield so a sequential implementation could not fake concurrency.
			await new Promise((resolve) => setTimeout(resolve, 5))
			inFlight -= 1
			return new Response(url.endsWith('a.json') ? 'full-a' : 'full-b')
		})
		const result = await readFiles({
			token: null,
			location: 'gist-1',
			paths: ['a.json', 'b.json'],
		})
		assert.equal(maxInFlight, 2, 'both raw_url downloads should overlap')
		assert.deepEqual(result, {
			ok: true,
			owner: null,
			files: {
				'a.json': { content: 'full-a', version: null },
				'b.json': { content: 'full-b', version: null },
			},
		})
	})
})

describe('writeFile', () => {
	it('PATCHes the gist with the given content', async () => {
		let capturedBody: unknown
		let capturedMethod: string | undefined
		stubFetch((_input, init) => {
			capturedMethod = init?.method
			capturedBody = JSON.parse(String(init?.body))
			return new Response(null, { status: 200 })
		})
		const result = await writeFile({
			token: 'token',
			location: 'gist-1',
			path: 'etfs.json',
			content: '[]',
		})
		assert.deepEqual(result, { ok: true })
		assert.equal(capturedMethod, 'PATCH')
		assert.deepEqual(capturedBody, {
			files: { 'etfs.json': { content: '[]' } },
		})
	})

	it('deletes the file when content is null', async () => {
		let capturedBody: unknown
		stubFetch((_input, init) => {
			capturedBody = JSON.parse(String(init?.body))
			return new Response(null, { status: 200 })
		})
		await writeFile({
			token: 'token',
			location: 'gist-1',
			path: 'advice-buy-next.json',
			content: null,
		})
		assert.deepEqual(capturedBody, {
			files: { 'advice-buy-next.json': null },
		})
	})

	it('returns ok: false with the status and response on a rejected write', async () => {
		stubFetch(() => new Response('validation failed', { status: 422 }))
		const result = await writeFile({
			token: 'token',
			location: 'gist-1',
			path: 'etfs.json',
			content: '[]',
		})
		assert.equal(result.ok, false)
		if (result.ok) throw new Error('unreachable')
		assert.equal(result.status, 422)
		assert.equal(await result.response.text(), 'validation failed')
	})
})

describe('writeFiles', () => {
	it('writes and deletes several files in one atomic PATCH', async () => {
		let capturedBody: unknown
		let requestCount = 0
		stubFetch((_input, init) => {
			requestCount += 1
			capturedBody = JSON.parse(String(init?.body))
			return new Response(null, { status: 200 })
		})
		const result = await writeFiles({
			token: 'token',
			location: 'gist-1',
			files: {
				'catalog.json': '[]',
				'catalog-source.json': null,
			},
		})
		assert.deepEqual(result, { ok: true })
		assert.equal(requestCount, 1)
		assert.deepEqual(capturedBody, {
			files: {
				'catalog.json': { content: '[]' },
				'catalog-source.json': null,
			},
		})
	})
})
