import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	buildGistBody,
	fetchEtfs,
	findOrCreateGist,
	GIST_FILENAME,
	getGistDescription,
	isPreview,
	parseEtfsFromGist,
	saveEtfs,
} from './gist.ts'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

/** Filler rows for `GET /gists` pages that must not match the app description. */
function unrelatedGists(count: number, page: string) {
	return Array.from({ length: count }, (_, index) => ({
		id: `${page}-${index}`,
		description: 'unrelated gist',
	}))
}

describe('gist', () => {
	it('exports the expected constants', () => {
		assert.equal(typeof GIST_FILENAME, 'string')
		assert.equal(typeof getGistDescription, 'function')
	})

	it('parseEtfsFromGist returns empty array for missing file', () => {
		const result = parseEtfsFromGist({ files: {} })
		assert.deepEqual(result, [])
	})

	it('parseEtfsFromGist returns empty array for null content', () => {
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: null } },
		})
		assert.deepEqual(result, [])
	})

	it('parseEtfsFromGist parses valid ETF JSON with new fields', () => {
		const entries = [
			{ id: 'abc-1', name: 'VTI', value: 1200.5, currency: 'USD' },
			{ id: 'abc-2', name: 'VWCE', value: 3400, currency: 'EUR' },
		]
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: JSON.stringify(entries) } },
		})
		assert.deepEqual(result, entries)
	})

	it('parseEtfsFromGist drops legacy quantity from stored JSON', () => {
		const raw = [
			{
				id: 'abc-1',
				name: 'VTI',
				value: 1000,
				currency: 'USD',
				quantity: 10,
			},
		]
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: JSON.stringify(raw) } },
		})
		assert.deepEqual(result, [
			{ id: 'abc-1', name: 'VTI', value: 1000, currency: 'USD' },
		])
	})

	it('parseEtfsFromGist returns empty array for invalid JSON', () => {
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: 'not-json!!!' } },
		})
		assert.deepEqual(result, [])
	})

	it('buildGistBody creates a valid create-gist request body', () => {
		const entries = [{ id: 'abc-1', name: 'SPY', value: 500, currency: 'USD' }]
		const body = buildGistBody(entries)

		assert.equal(body.description, 'ai-investor-data')
		assert.equal(body.public, false)
		assert.ok(body.files[GIST_FILENAME])
		assert.equal(
			body.files[GIST_FILENAME].content,
			JSON.stringify(entries, null, 2),
		)
	})

	it('isPreview returns true when FLY_APP_NAME is ainvestor-preview', () => {
		const previousFlyAppName = process.env.FLY_APP_NAME
		try {
			process.env.FLY_APP_NAME = 'ainvestor-preview'
			assert.equal(isPreview(), true)
		} finally {
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('isPreview returns false for production or unset env', () => {
		const previousFlyAppName = process.env.FLY_APP_NAME
		try {
			delete process.env.FLY_APP_NAME
			assert.equal(isPreview(), false)
			process.env.FLY_APP_NAME = 'ainvestor'
			assert.equal(isPreview(), false)
		} finally {
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('getGistDescription returns preview suffix when FLY_APP_NAME is ainvestor-preview', () => {
		const previousFlyAppName = process.env.FLY_APP_NAME
		try {
			process.env.FLY_APP_NAME = 'ainvestor-preview'
			assert.equal(getGistDescription(), 'ai-investor-preview-data')
		} finally {
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('fetchEtfs throws when GitHub API returns an error status', async () => {
		const previousFetch = globalThis.fetch
		globalThis.fetch = async () =>
			new Response(null, { status: 403, statusText: 'Forbidden' })
		try {
			await assert.rejects(
				async () => fetchEtfs('token', 'gist-id'),
				/GitHub API error fetching portfolio gist: 403/,
			)
		} finally {
			globalThis.fetch = previousFetch
		}
	})

	it('saveEtfs throws when GitHub API returns an error status', async () => {
		const previousFetch = globalThis.fetch
		globalThis.fetch = async () =>
			new Response(null, { status: 422, statusText: 'Unprocessable' })
		try {
			await assert.rejects(
				async () =>
					saveEtfs('token', 'gist-id', [
						{ id: 'a', name: 'X', value: 1, currency: 'PLN' },
					]),
				/GitHub API error saving portfolio gist: 422/,
			)
		} finally {
			globalThis.fetch = previousFetch
		}
	})

	it('getGistDescription returns base description for production or unset env', () => {
		const previousFlyAppName = process.env.FLY_APP_NAME
		try {
			delete process.env.FLY_APP_NAME
			assert.equal(getGistDescription(), 'ai-investor-data')
			process.env.FLY_APP_NAME = 'ainvestor'
			assert.equal(getGistDescription(), 'ai-investor-data')
		} finally {
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('findOrCreateGist finds an existing gist beyond the first page', async () => {
		const previousFetch = globalThis.fetch
		const previousFlyAppName = process.env.FLY_APP_NAME
		const requestedUrls: string[] = []
		globalThis.fetch = async (input: FetchInput) => {
			const url = String(input)
			requestedUrls.push(url)
			// Match the parsed param: `per_page=100` also contains `page=1`.
			const page = new URL(url).searchParams.get('page')
			if (page === '1') {
				return Response.json(unrelatedGists(100, 'first'))
			}
			if (page === '2') {
				return Response.json([
					...unrelatedGists(3, 'second'),
					{ id: 'portfolio-gist-id', description: 'ai-investor-data' },
				])
			}
			throw new Error(`unexpected request: ${url}`)
		}
		try {
			delete process.env.FLY_APP_NAME
			assert.equal(await findOrCreateGist('token'), 'portfolio-gist-id')
			assert.equal(requestedUrls.length, 2)
			assert.ok(requestedUrls[0].includes('per_page=100'))
		} finally {
			globalThis.fetch = previousFetch
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('findOrCreateGist stops paging once a partial page rules out a match', async () => {
		const previousFetch = globalThis.fetch
		const previousFlyAppName = process.env.FLY_APP_NAME
		const requestedUrls: string[] = []
		let createdBody = ''
		globalThis.fetch = async (input: FetchInput, init?: FetchInit) => {
			const url = String(input)
			if (init?.method === 'POST') {
				createdBody = String(init.body)
				return Response.json({ id: 'created-gist-id' }, { status: 201 })
			}
			requestedUrls.push(url)
			return Response.json(unrelatedGists(2, 'only'))
		}
		try {
			delete process.env.FLY_APP_NAME
			assert.equal(await findOrCreateGist('token'), 'created-gist-id')
			assert.equal(requestedUrls.length, 1, 'short page means no page 2')
			const created = JSON.parse(createdBody) as {
				description: string
				public: boolean
			}
			assert.equal(created.description, 'ai-investor-data')
			assert.equal(created.public, false)
		} finally {
			globalThis.fetch = previousFetch
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('findOrCreateGist returns the first-page match without paging further', async () => {
		const previousFetch = globalThis.fetch
		const previousFlyAppName = process.env.FLY_APP_NAME
		let listCallCount = 0
		globalThis.fetch = async () => {
			listCallCount++
			return Response.json([
				...unrelatedGists(4, 'first'),
				{ id: 'portfolio-gist-id', description: 'ai-investor-data' },
			])
		}
		try {
			delete process.env.FLY_APP_NAME
			assert.equal(await findOrCreateGist('token'), 'portfolio-gist-id')
			assert.equal(listCallCount, 1)
		} finally {
			globalThis.fetch = previousFetch
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('findOrCreateGist throws rather than creating a duplicate when the page cap is hit', async () => {
		const previousFetch = globalThis.fetch
		const previousFlyAppName = process.env.FLY_APP_NAME
		let listCallCount = 0
		globalThis.fetch = async (_input: FetchInput, init?: FetchInit) => {
			if (init?.method === 'POST') {
				throw new Error('must not create a gist after an inconclusive sweep')
			}
			listCallCount++
			return Response.json(unrelatedGists(100, `page-${listCallCount}`))
		}
		try {
			delete process.env.FLY_APP_NAME
			await assert.rejects(
				async () => findOrCreateGist('token'),
				/returned more than 5000 gists without matching "ai-investor-data"/,
			)
			assert.equal(listCallCount, 50, 'expected the 50-page cap to be spent')
		} finally {
			globalThis.fetch = previousFetch
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('findOrCreateGist throws when listing gists fails', async () => {
		const previousFetch = globalThis.fetch
		globalThis.fetch = async () => new Response(null, { status: 401 })
		try {
			await assert.rejects(
				async () => findOrCreateGist('token'),
				/GitHub API error listing gists: 401/,
			)
		} finally {
			globalThis.fetch = previousFetch
		}
	})
})
