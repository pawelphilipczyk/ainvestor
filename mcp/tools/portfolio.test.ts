import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { EtfEntry } from '../../app/lib/gist.ts'
import { GIST_FILENAME } from '../../app/lib/gist.ts'
import type { McpConfig } from '../config.ts'
import { resetDataGistIdCache, resolveDataGistId } from '../data-gist.ts'
import { createGetPortfolioTool, summarizePortfolio } from './portfolio.ts'

const config: McpConfig = {
	githubToken: 'token-value',
	sharedCatalogGistId: 'catalog-gist',
	dataGistId: 'pinned-gist',
	allowWrites: false,
}

function entry(overrides: Partial<EtfEntry> = {}): EtfEntry {
	return { id: 'a', name: 'VWCE', value: 1000, currency: 'PLN', ...overrides }
}

/** Serve one gist payload to `fetchEtfs`, returning the URLs that were requested. */
function stubGist(entries: EtfEntry[]): string[] {
	const requestedUrls: string[] = []
	globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
		requestedUrls.push(String(input))
		return Response.json({
			files: { [GIST_FILENAME]: { content: JSON.stringify(entries) } },
		})
	}
	return requestedUrls
}

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	resetDataGistIdCache()
})

describe('summarizePortfolio', () => {
	it('reports an empty portfolio as empty, not as mixed currency', () => {
		const summary = summarizePortfolio([])
		assert.equal(summary.holdingCount, 0)
		assert.equal(summary.totalValue, null)
		assert.equal(summary.mixedCurrencies, false)
		assert.match(String(summary.note), /empty/i)
	})

	it('totals a single-currency portfolio and computes shares', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 3000 }),
			entry({ id: 'b', name: 'IWDA', value: 1000 }),
		])
		assert.equal(summary.totalValue, 4000)
		assert.equal(summary.currency, 'PLN')
		assert.equal(summary.mixedCurrencies, false)
		assert.deepEqual(
			summary.holdings.map((holding) => holding.sharePct),
			[75, 25],
		)
	})

	it('withholds the total and shares when currencies are mixed', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 3000, currency: 'PLN' }),
			entry({ id: 'b', value: 1000, currency: 'EUR' }),
		])
		assert.equal(summary.mixedCurrencies, true)
		assert.equal(summary.totalValue, null)
		assert.equal(summary.currency, null)
		assert.match(String(summary.note), /FX/)
		for (const holding of summary.holdings) {
			assert.equal('sharePct' in holding, false)
		}
	})

	it('rounds shares and totals to two decimals', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 1 }),
			entry({ id: 'b', value: 2 }),
		])
		assert.equal(summary.holdings[0].sharePct, 33.33)
		assert.equal(summary.holdings[1].sharePct, 66.67)
	})

	it('reports a negative holding at its real share, not clamped to zero', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 4500 }),
			entry({ id: 'b', value: -500 }),
		])
		assert.equal(summary.totalValue, 4000)
		assert.equal(summary.holdings[1].sharePct, -12.5)
	})

	it('omits the share and flags the row when a value is not finite', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 1000 }),
			entry({ id: 'b', value: Number.POSITIVE_INFINITY }),
		])
		assert.equal(summary.holdings[0].sharePct, 100)
		assert.equal('sharePct' in summary.holdings[1], false)
		assert.match(String(summary.note), /non-numeric value/)
	})

	it('omits shares when every holding is zero', () => {
		const summary = summarizePortfolio([entry({ value: 0 })])
		assert.equal(summary.totalValue, 0)
		assert.equal('sharePct' in summary.holdings[0], false)
	})

	it('carries ticker and exchange through only when present', () => {
		const summary = summarizePortfolio([
			entry({ ticker: 'VWCE', exchange: 'XETRA' }),
		])
		assert.equal(summary.holdings[0].ticker, 'VWCE')
		assert.equal(summary.holdings[0].exchange, 'XETRA')
		const bare = summarizePortfolio([entry()])
		assert.equal('ticker' in bare.holdings[0], false)
		assert.equal('exchange' in bare.holdings[0], false)
	})
})

describe('data gist resolution', () => {
	const discovering: McpConfig = { ...config, dataGistId: null }

	/** One page of gists, optionally containing the app's own. */
	function stubGistList(descriptions: string[]): { calls: number } {
		const counter = { calls: 0 }
		globalThis.fetch = async () => {
			counter.calls++
			return Response.json(
				descriptions.map((description, index) => ({
					id: `gist-${index}`,
					description,
				})),
			)
		}
		return counter
	}

	it('discovers the gist by description when no id is pinned', async () => {
		stubGistList(['unrelated', 'ai-investor-data'])
		assert.equal(await resolveDataGistId(discovering), 'gist-1')
	})

	it('sweeps only once for concurrent callers', async () => {
		const counter = stubGistList(['ai-investor-data'])
		const [first, second] = await Promise.all([
			resolveDataGistId(discovering),
			resolveDataGistId(discovering),
		])
		assert.equal(first, 'gist-0')
		assert.equal(second, 'gist-0')
		assert.equal(counter.calls, 1)
	})

	it('explains what to do when no matching gist exists, and never creates one', async () => {
		const counter = stubGistList(['unrelated'])
		await assert.rejects(
			async () => resolveDataGistId(discovering),
			/No gist described "ai-investor-data" is visible to this token/,
		)
		// A POST would mean a gist was created; only the listing GET is allowed.
		assert.equal(counter.calls, 1)
	})

	it('does not cache a failure, so a retry after signing in succeeds', async () => {
		stubGistList(['unrelated'])
		await assert.rejects(async () => resolveDataGistId(discovering))
		stubGistList(['ai-investor-data'])
		assert.equal(await resolveDataGistId(discovering), 'gist-0')
	})
})

describe('get_portfolio tool', () => {
	it('declares a no-argument input schema', () => {
		const tool = createGetPortfolioTool(config)
		assert.equal(tool.name, 'get_portfolio')
		assert.deepEqual(tool.inputSchema, { type: 'object', properties: {} })
	})

	it('warns in its description that there is no time or quantity data', () => {
		const tool = createGetPortfolioTool(config)
		assert.match(tool.description, /no quantities, prices, or dates/)
	})

	it('reads the pinned gist and returns the summary as JSON text', async () => {
		const requestedUrls = stubGist([entry({ value: 2500 })])
		const tool = createGetPortfolioTool(config)

		const result = await tool.handler({})

		assert.equal(requestedUrls.length, 1)
		assert.match(requestedUrls[0], /\/gists\/pinned-gist$/)
		assert.equal(result.content.length, 1)
		const payload = JSON.parse(result.content[0].text) as {
			totalValue: number
			holdings: { name: string }[]
		}
		assert.equal(payload.totalValue, 2500)
		assert.deepEqual(
			payload.holdings.map((holding) => holding.name),
			['VWCE'],
		)
	})

	it('propagates a gist failure so the dispatcher can mark it as a tool error', async () => {
		globalThis.fetch = async () => new Response(null, { status: 404 })
		const tool = createGetPortfolioTool(config)
		await assert.rejects(
			async () => tool.handler({}),
			/GitHub API error fetching portfolio gist: 404/,
		)
	})
})
