import * as assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'

import { GIST_FILENAME } from '../app/lib/gist.ts'
import { GUIDELINES_FILENAME } from '../app/lib/guidelines.ts'
import {
	fetchEtfsCached,
	fetchGuidelinesOrThrowCached,
	invalidateGuidelinesCache,
	resetPrivateGistCacheForTests,
} from './private-gist-cache.ts'

const originalFetch = globalThis.fetch
const originalTtl = process.env.PRIVATE_GIST_CACHE_TTL_MS

afterEach(() => {
	globalThis.fetch = originalFetch
	resetPrivateGistCacheForTests()
	mock.timers.reset()
	if (originalTtl === undefined) {
		delete process.env.PRIVATE_GIST_CACHE_TTL_MS
	} else {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = originalTtl
	}
})

/** Serve both files from any data repo's Contents API, counting how many GETs land. */
function stubGist(params: { holdings: unknown[]; guidelines: unknown[] }): {
	count: number
} {
	const counter = { count: 0 }
	const files: Record<string, string> = {
		[GIST_FILENAME]: JSON.stringify(params.holdings),
		[GUIDELINES_FILENAME]: JSON.stringify(params.guidelines),
	}
	globalThis.fetch = async (input) => {
		counter.count += 1
		const path = new URL(String(input)).pathname.split('/contents/')[1] ?? ''
		const content = files[path]
		return content === undefined
			? new Response(null, { status: 404 })
			: Response.json({
					content: Buffer.from(content, 'utf-8').toString('base64'),
					encoding: 'base64',
					sha: `sha-${path}`,
				})
	}
	return counter
}

describe('fetchEtfsCached', () => {
	it('hits GitHub once and returns independent clones while the cache entry is valid', async () => {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = '60000'
		const counter = stubGist({
			holdings: [{ id: 'a', name: 'VWCE', value: 1000, currency: 'PLN' }],
			guidelines: [],
		})

		const first = await fetchEtfsCached('token', 'octocat/ainvestor-data')
		const second = await fetchEtfsCached('token', 'octocat/ainvestor-data')

		assert.equal(counter.count, 1)
		assert.equal(first[0]?.name, 'VWCE')
		first[0].name = 'mutated'
		assert.equal(second[0]?.name, 'VWCE')
	})

	it('does not cache when the ttl is 0', async () => {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = '0'
		const counter = stubGist({
			holdings: [{ id: 'a', name: 'VWCE', value: 1000, currency: 'PLN' }],
			guidelines: [],
		})

		await fetchEtfsCached('token', 'octocat/ainvestor-data')
		await fetchEtfsCached('token', 'octocat/ainvestor-data')

		assert.equal(counter.count, 2)
	})

	it('refetches once the ttl has expired', async () => {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = '60000'
		mock.timers.enable({ apis: ['Date'] })
		const counter = stubGist({
			holdings: [{ id: 'a', name: 'VWCE', value: 1000, currency: 'PLN' }],
			guidelines: [],
		})

		await fetchEtfsCached('token', 'octocat/ainvestor-data')
		assert.equal(counter.count, 1)

		mock.timers.tick(59_000)
		await fetchEtfsCached('token', 'octocat/ainvestor-data')
		assert.equal(counter.count, 1)

		mock.timers.tick(2_000)
		await fetchEtfsCached('token', 'octocat/ainvestor-data')
		assert.equal(counter.count, 2)
	})

	it('keeps two data repos apart even for the same token', async () => {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = '60000'
		const counter = stubGist({
			holdings: [{ id: 'a', name: 'VWCE', value: 1000, currency: 'PLN' }],
			guidelines: [],
		})

		await fetchEtfsCached('token', 'octocat/ainvestor-data')
		await fetchEtfsCached('token', 'octocat/other-data')

		assert.equal(counter.count, 2)
	})
})

describe('fetchGuidelinesOrThrowCached', () => {
	it('hits GitHub once while the cache entry is valid', async () => {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = '60000'
		const counter = stubGist({
			holdings: [],
			guidelines: [
				{
					id: 'g1',
					kind: 'asset_class',
					etfName: '',
					etfType: 'equity',
					targetPct: 40,
				},
			],
		})

		const first = await fetchGuidelinesOrThrowCached(
			'token',
			'octocat/ainvestor-data',
		)
		const second = await fetchGuidelinesOrThrowCached(
			'token',
			'octocat/ainvestor-data',
		)

		assert.equal(counter.count, 1)
		assert.equal(first[0]?.targetPct, 40)
		first[0].targetPct = 99
		assert.equal(second[0]?.targetPct, 40)
	})

	it('serves a fresh read right after invalidateGuidelinesCache', async () => {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = '60000'
		const counter = stubGist({ holdings: [], guidelines: [] })

		await fetchGuidelinesOrThrowCached('token', 'octocat/ainvestor-data')
		assert.equal(counter.count, 1)

		invalidateGuidelinesCache('token', 'octocat/ainvestor-data')
		await fetchGuidelinesOrThrowCached('token', 'octocat/ainvestor-data')

		assert.equal(counter.count, 2)
	})
})
