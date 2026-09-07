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

/** Serve one gist payload holding both files, counting how many GETs land. */
function stubGist(params: { holdings: unknown[]; guidelines: unknown[] }): {
	count: number
} {
	const counter = { count: 0 }
	globalThis.fetch = async () => {
		counter.count += 1
		return Response.json({
			files: {
				[GIST_FILENAME]: { content: JSON.stringify(params.holdings) },
				[GUIDELINES_FILENAME]: { content: JSON.stringify(params.guidelines) },
			},
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

		const first = await fetchEtfsCached('token', 'gist-1')
		const second = await fetchEtfsCached('token', 'gist-1')

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

		await fetchEtfsCached('token', 'gist-1')
		await fetchEtfsCached('token', 'gist-1')

		assert.equal(counter.count, 2)
	})

	it('refetches once the ttl has expired', async () => {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = '60000'
		mock.timers.enable({ apis: ['Date'] })
		const counter = stubGist({
			holdings: [{ id: 'a', name: 'VWCE', value: 1000, currency: 'PLN' }],
			guidelines: [],
		})

		await fetchEtfsCached('token', 'gist-1')
		assert.equal(counter.count, 1)

		mock.timers.tick(59_000)
		await fetchEtfsCached('token', 'gist-1')
		assert.equal(counter.count, 1)

		mock.timers.tick(2_000)
		await fetchEtfsCached('token', 'gist-1')
		assert.equal(counter.count, 2)
	})

	it('keeps two gist ids apart even for the same token', async () => {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = '60000'
		const counter = stubGist({
			holdings: [{ id: 'a', name: 'VWCE', value: 1000, currency: 'PLN' }],
			guidelines: [],
		})

		await fetchEtfsCached('token', 'gist-1')
		await fetchEtfsCached('token', 'gist-2')

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

		const first = await fetchGuidelinesOrThrowCached('token', 'gist-1')
		const second = await fetchGuidelinesOrThrowCached('token', 'gist-1')

		assert.equal(counter.count, 1)
		assert.equal(first[0]?.targetPct, 40)
		first[0].targetPct = 99
		assert.equal(second[0]?.targetPct, 40)
	})

	it('serves a fresh read right after invalidateGuidelinesCache', async () => {
		process.env.PRIVATE_GIST_CACHE_TTL_MS = '60000'
		const counter = stubGist({ holdings: [], guidelines: [] })

		await fetchGuidelinesOrThrowCached('token', 'gist-1')
		assert.equal(counter.count, 1)

		invalidateGuidelinesCache('token', 'gist-1')
		await fetchGuidelinesOrThrowCached('token', 'gist-1')

		assert.equal(counter.count, 2)
	})
})
