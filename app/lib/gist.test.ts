import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	fetchEtfs,
	findGistIdByDescription,
	GIST_FILENAME,
	getGistDescription,
	parseEtfsFromGist,
	saveEtfs,
} from './gist.ts'

type FetchInput = Parameters<typeof fetch>[0]

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
				async () => fetchEtfs('token', 'octocat/ainvestor-data'),
				/GitHub API error fetching the portfolio: 403/,
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
					saveEtfs('token', 'octocat/ainvestor-data', [
						{ id: 'a', name: 'X', value: 1, currency: 'PLN' },
					]),
				/GitHub API error saving the portfolio: 422/,
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

	it('findGistIdByDescription finds a gist beyond the first page', async () => {
		const previousFetch = globalThis.fetch
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
			assert.equal(
				await findGistIdByDescription('token', 'ai-investor-data'),
				'portfolio-gist-id',
			)
			assert.equal(requestedUrls.length, 2)
			assert.ok(requestedUrls[0].includes('per_page=100'))
		} finally {
			globalThis.fetch = previousFetch
		}
	})

	it('findGistIdByDescription stops paging once a partial page rules out a match', async () => {
		const previousFetch = globalThis.fetch
		let listCallCount = 0
		globalThis.fetch = async () => {
			listCallCount++
			return Response.json(unrelatedGists(2, 'only'))
		}
		try {
			assert.equal(
				await findGistIdByDescription('token', 'ai-investor-data'),
				null,
			)
			assert.equal(listCallCount, 1, 'short page means no page 2')
		} finally {
			globalThis.fetch = previousFetch
		}
	})

	it('findGistIdByDescription returns the first-page match without paging further', async () => {
		const previousFetch = globalThis.fetch
		let listCallCount = 0
		globalThis.fetch = async () => {
			listCallCount++
			return Response.json([
				...unrelatedGists(4, 'first'),
				{ id: 'portfolio-gist-id', description: 'ai-investor-data' },
			])
		}
		try {
			assert.equal(
				await findGistIdByDescription('token', 'ai-investor-data'),
				'portfolio-gist-id',
			)
			assert.equal(listCallCount, 1)
		} finally {
			globalThis.fetch = previousFetch
		}
	})

	it('findGistIdByDescription throws rather than answering "none" when the page cap is hit', async () => {
		const previousFetch = globalThis.fetch
		let listCallCount = 0
		globalThis.fetch = async () => {
			listCallCount++
			return Response.json(unrelatedGists(100, `page-${listCallCount}`))
		}
		try {
			await assert.rejects(
				async () => findGistIdByDescription('token', 'ai-investor-data'),
				/returned more than 5000 gists without matching "ai-investor-data"/,
			)
			assert.equal(listCallCount, 50, 'expected the 50-page cap to be spent')
		} finally {
			globalThis.fetch = previousFetch
		}
	})

	it('findGistIdByDescription throws when listing gists fails', async () => {
		const previousFetch = globalThis.fetch
		globalThis.fetch = async () => new Response(null, { status: 401 })
		try {
			await assert.rejects(
				async () => findGistIdByDescription('token', 'ai-investor-data'),
				/GitHub API error listing gists: 401/,
			)
		} finally {
			globalThis.fetch = previousFetch
		}
	})
})
