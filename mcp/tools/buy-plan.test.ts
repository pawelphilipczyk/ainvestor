import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { CatalogEntry } from '../../app/features/catalog/lib.ts'
import {
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../../app/features/catalog/lib.ts'
import type { EtfEntry } from '../../app/lib/gist.ts'
import { GIST_FILENAME } from '../../app/lib/gist.ts'
import type { EtfGuideline } from '../../app/lib/guidelines.ts'
import { GUIDELINES_FILENAME } from '../../app/lib/guidelines.ts'
import type { GistCredentials } from '../data-gist.ts'
import { resetDataGistIdCache } from '../data-gist.ts'
import type { BuyPlanSummary } from './buy-plan.ts'
import { createGetBuyPlanTool, summarizeBuyPlan } from './buy-plan.ts'

const credentials: GistCredentials = {
	githubToken: 'token-value',
	dataGistId: 'pinned-gist',
}

function holding(overrides: Partial<EtfEntry> = {}): EtfEntry {
	return { id: 'h1', name: 'A', value: 1000, currency: 'PLN', ...overrides }
}

function guideline(overrides: Partial<EtfGuideline> = {}): EtfGuideline {
	return {
		id: 'g1',
		kind: 'asset_class',
		etfName: '',
		targetPct: 50,
		etfType: 'equity',
		...overrides,
	}
}

function catalogEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
	return {
		id: 't:A',
		ticker: 'A',
		name: 'A',
		type: 'equity',
		description: '',
		...overrides,
	}
}

/** The 30/40/30 portfolio the advice tests use, where cash falls short of the minimum buys. */
const SHORTFALL = {
	catalog: [
		catalogEntry(),
		catalogEntry({ id: 't:B', ticker: 'B', name: 'B', type: 'bond' }),
		catalogEntry({ id: 't:C', ticker: 'C', name: 'C', type: 'commodity' }),
	],
	guidelines: [
		guideline({ id: 'g1', targetPct: 30, etfType: 'equity' }),
		guideline({ id: 'g2', targetPct: 40, etfType: 'bond' }),
		guideline({ id: 'g3', targetPct: 30, etfType: 'commodity' }),
	],
	holdings: [
		holding({ id: 'h1', name: 'A', ticker: 'A', value: 2000 }),
		holding({ id: 'h2', name: 'B', ticker: 'B', value: 3000 }),
		holding({ id: 'h3', name: 'C', ticker: 'C', value: 5000 }),
	],
}

/** Everything the pure summary needs, with each field overridable per test. */
function summarize(
	overrides: Partial<Parameters<typeof summarizeBuyPlan>[0]> = {},
): BuyPlanSummary {
	return summarizeBuyPlan({
		holdings: SHORTFALL.holdings,
		guidelines: SHORTFALL.guidelines,
		catalog: SHORTFALL.catalog,
		cashAmountText: '5000',
		cashCurrency: 'PLN',
		cashCurrencySource: 'holdings',
		...overrides,
	})
}

/** Narrow to the branch that carries numbers, failing with the reason if it does not. */
function withDiagnostics(summary: BuyPlanSummary) {
	if (!summary.available) {
		assert.fail(`expected diagnostics, got blocked: ${summary.reason}`)
	}
	return summary
}

/** Narrow to the blocked branch, failing loudly if numbers came back instead. */
function withoutDiagnostics(summary: BuyPlanSummary) {
	if (summary.available) {
		assert.fail(`expected no diagnostics, got ${JSON.stringify(summary)}`)
	}
	return summary
}

/** Serve one gist carrying both the holdings and the guidelines files. */
function stubGist(params: {
	holdings: EtfEntry[]
	guidelines: EtfGuideline[]
}): string[] {
	const requestedUrls: string[] = []
	globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
		requestedUrls.push(String(input))
		return Response.json({
			files: {
				[GIST_FILENAME]: { content: JSON.stringify(params.holdings) },
				[GUIDELINES_FILENAME]: { content: JSON.stringify(params.guidelines) },
			},
		})
	}
	return requestedUrls
}

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	resetDataGistIdCache()
	resetSharedCatalogForTests()
})

describe('summarizeBuyPlan', () => {
	it('reports per-bucket gaps and splits cash that falls short of the minimum buys', () => {
		const summary = withDiagnostics(summarize())

		assert.equal(summary.portfolioValue, 10000)
		assert.equal(summary.postInvestmentTotal, 15000)
		assert.equal(summary.minimumBuysTotal, 5500)
		assert.equal(summary.cashCoversAllMinimumBuys, false)
		// Structurally zero here, so it is left out rather than reported as spare cash.
		assert.equal('cashLeftAfterMinimumBuys' in summary, false)

		const byType = new Map(
			summary.buckets.map((bucket) => [bucket.etfType, bucket]),
		)
		assert.deepEqual(
			summary.buckets.map((bucket) => bucket.etfType),
			['bond', 'equity', 'commodity'],
		)
		assert.equal(byType.get('equity')?.targetValueAfterInvesting, 4500)
		assert.equal(byType.get('equity')?.minimumBuy, 2500)
		assert.equal(byType.get('bond')?.minimumBuy, 3000)
		// Already above target: buy-only leaves it there rather than selling down.
		assert.equal(byType.get('commodity')?.currentValue, 5000)
		assert.equal(byType.get('commodity')?.minimumBuy, 0)

		// The 5000 splits in proportion to the 2500/3000 minimums.
		assert.equal(byType.get('equity')?.deployCash, 2272.73)
		assert.equal(byType.get('bond')?.deployCash, 2727.27)
		assert.equal(byType.get('commodity')?.deployCash, 0)
	})

	it('marks the cash as covering every minimum buy when no bucket is overweight', () => {
		const summary = withDiagnostics(
			summarize({
				holdings: [
					holding({ id: 'h1', name: 'A', ticker: 'A', value: 4000 }),
					holding({ id: 'h2', name: 'B', ticker: 'B', value: 4000 }),
				],
				guidelines: [
					guideline({ id: 'g1', targetPct: 50, etfType: 'equity' }),
					guideline({ id: 'g2', targetPct: 50, etfType: 'bond' }),
				],
				cashAmountText: '2000',
			}),
		)

		assert.equal(summary.cashCoversAllMinimumBuys, true)
		assert.equal(summary.minimumBuysTotal, 2000)
		assert.deepEqual(
			summary.buckets.map((bucket) => bucket.deployCash),
			[1000, 1000],
		)
	})

	it('normalizes targets that do not sum to 100 and reports both percentages', () => {
		const summary = withDiagnostics(
			summarize({
				holdings: [],
				guidelines: [
					guideline({ id: 'g1', targetPct: 40, etfType: 'equity' }),
					guideline({ id: 'g2', targetPct: 40, etfType: 'bond' }),
				],
				cashAmountText: '1000',
			}),
		)

		assert.equal(summary.targetPctSum, 80)
		assert.equal(summary.buckets[0].targetPct, 40)
		assert.equal(summary.buckets[0].normalizedTargetPct, 50)
		assert.equal(summary.buckets[0].targetValueAfterInvesting, 500)
	})

	it('folds a named-fund target into its own asset class rather than adding a bucket', () => {
		const summary = withDiagnostics(
			summarize({
				holdings: [],
				guidelines: [
					guideline({ id: 'g1', kind: 'asset_class', targetPct: 50 }),
					guideline({
						id: 'g2',
						kind: 'instrument',
						etfName: 'A',
						targetPct: 50,
					}),
				],
				cashAmountText: '1000',
			}),
		)

		assert.equal(summary.buckets.length, 1)
		assert.equal(summary.buckets[0].targetPct, 100)
	})

	it('accepts a locale decimal amount the way the web form does', () => {
		const summary = withDiagnostics(summarize({ cashAmountText: '5 000,50' }))
		assert.equal(summary.cash.amount, 5000.5)
	})
})

describe('summarizeBuyPlan blockers', () => {
	it('withholds every number when the cash amount is not a number', () => {
		const summary = withoutDiagnostics(summarize({ cashAmountText: 'a lot' }))
		assert.equal(summary.blocker, 'unparseable_cash')
	})

	it('names mixed holding currencies and the missing FX conversion', () => {
		const summary = withoutDiagnostics(
			summarize({
				holdings: [
					holding({ id: 'h1', name: 'A', ticker: 'A', value: 2000 }),
					holding({
						id: 'h2',
						name: 'B',
						ticker: 'B',
						value: 3000,
						currency: 'EUR',
					}),
				],
			}),
		)

		assert.equal(summary.blocker, 'mixed_holding_currencies')
		assert.match(summary.reason, /no FX conversion/)
	})

	it('distinguishes cash in the wrong currency from mixed holdings, and names the right one', () => {
		const summary = withoutDiagnostics(
			summarize({ cashCurrency: 'EUR', cashCurrencySource: 'argument' }),
		)

		assert.equal(summary.blocker, 'cash_currency_mismatch')
		assert.match(summary.reason, /cash is in EUR/)
		assert.match(summary.reason, /cashCurrency "PLN"/)
	})

	it('says there are no targets rather than reporting an empty bucket list', () => {
		const summary = withoutDiagnostics(summarize({ guidelines: [] }))

		assert.equal(summary.blocker, 'no_guidelines')
		assert.match(summary.reason, /set_guideline/)
		assert.equal(summary.guidelineCount, 0)
	})

	it('separates targets that are all zero from having no targets at all', () => {
		const summary = withoutDiagnostics(
			summarize({ holdings: [], guidelines: [guideline({ targetPct: 0 })] }),
		)

		assert.equal(summary.blocker, 'no_positive_targets')
	})

	it('names the holding whose asset class has no target', () => {
		const summary = withoutDiagnostics(
			summarize({
				guidelines: [
					guideline({ id: 'g1', targetPct: 100, etfType: 'equity' }),
				],
			}),
		)

		assert.equal(summary.blocker, 'unclassified_holding')
		assert.match(summary.reason, /"B" is bond/)
		assert.match(summary.reason, /Add a bond target/)
	})

	it('tells an unrecognised holding apart from one whose class is simply untargeted', () => {
		const summary = withoutDiagnostics(
			summarize({
				catalog: [
					catalogEntry({ id: 't:X', ticker: 'X', name: 'X', type: 'equity' }),
				],
				holdings: [holding({ name: 'Mystery Fund', ticker: 'ZZZ' })],
				guidelines: [guideline({ targetPct: 100 })],
			}),
		)

		assert.equal(summary.blocker, 'unclassified_holding')
		assert.match(summary.reason, /"Mystery Fund" resolves to the "mixed" class/)
		assert.match(summary.reason, /upsert_catalog_entry/)
	})

	/**
	 * `fetchCatalog` reports an unconfigured gist id, a rejected read and a
	 * timeout identically as zero rows, so the tool must not turn that into a
	 * claim about what the shared catalog contains.
	 */
	it('blames an empty catalog on the catalog, not on the holding being unlisted', () => {
		const summary = withoutDiagnostics(
			summarize({
				catalog: [],
				holdings: [holding({ name: 'Mystery Fund', ticker: 'ZZZ' })],
				guidelines: [guideline({ targetPct: 100 })],
			}),
		)

		assert.equal(summary.blocker, 'unclassified_holding')
		assert.match(summary.reason, /no entries at all/)
		assert.match(summary.reason, /not configured or temporarily unreachable/)
		// Never tell the caller to write to shared data on the strength of a read
		// that may simply have failed.
		assert.equal(/upsert_catalog_entry/.test(summary.reason), false)
	})

	/**
	 * "mixed" is a real persisted EtfType as well as the resolver's no-match
	 * fallback, so a fund the catalog genuinely classifies as mixed lands here
	 * too. The message must not assert the catalog does not list it.
	 */
	it('does not claim a catalogued mixed fund is missing from the catalog', () => {
		const summary = withoutDiagnostics(
			summarize({
				catalog: [
					catalogEntry({
						id: 't:MIX',
						ticker: 'MIX',
						name: 'Mixed Fund',
						type: 'mixed',
					}),
				],
				holdings: [holding({ name: 'Mixed Fund', ticker: 'MIX' })],
				guidelines: [guideline({ targetPct: 100, etfType: 'mixed' })],
			}),
		)

		assert.equal(summary.blocker, 'unclassified_holding')
		assert.equal(/does not list it/.test(summary.reason), false)
		assert.match(summary.reason, /either the catalog classifies it that way/)
	})
})

describe('summarizeBuyPlan rounding', () => {
	/**
	 * The diagnostics come from the unrounded parse, so the deployment must too.
	 * Planning against the rounded cash strands the difference as a remainder,
	 * which the leftover field would then report as genuine spare cash.
	 */
	it('does not turn sub-grosz rounding into reported spare cash', () => {
		const summary = withDiagnostics(
			summarize({
				holdings: [],
				guidelines: [guideline({ targetPct: 100 })],
				cashAmountText: '82818.045',
			}),
		)

		assert.equal(summary.cash.amount, 82818.05)
		assert.equal(summary.cashCoversAllMinimumBuys, true)
		assert.equal('cashLeftAfterMinimumBuys' in summary, false)
		// An empty portfolio is worth 0, never a negative rounding artifact.
		assert.equal(summary.portfolioValue, 0)
	})
})

describe('get_buy_plan tool', () => {
	it('requires cashAmount and states the buy-only constraint', () => {
		const tool = createGetBuyPlanTool(credentials)
		assert.equal(tool.name, 'get_buy_plan')
		assert.deepEqual(tool.inputSchema.required, ['cashAmount'])
		assert.match(tool.description, /buy-only/i)
	})

	it('reads holdings, guidelines and catalog, then answers with the buckets', async () => {
		setSharedCatalogForTests({
			entries: SHORTFALL.catalog,
			ownerLogin: null,
		})
		const requestedUrls = stubGist({
			holdings: SHORTFALL.holdings,
			guidelines: SHORTFALL.guidelines,
		})
		const tool = createGetBuyPlanTool(credentials)

		const result = await tool.handler({ cashAmount: '5000' })

		assert.ok(
			requestedUrls.every((url) => url.endsWith('/gists/pinned-gist')),
			`unexpected requests: ${requestedUrls.join(', ')}`,
		)
		const payload = JSON.parse(result.content[0].text) as BuyPlanSummary
		const summary = withDiagnostics(payload)
		assert.equal(summary.postInvestmentTotal, 15000)
		// No cashCurrency was passed, so it came from the holdings.
		assert.equal(summary.cash.currency, 'PLN')
		assert.equal(summary.cash.currencySource, 'holdings')
	})

	it('accepts cashAmount as a number, which models routinely send', async () => {
		setSharedCatalogForTests({
			entries: SHORTFALL.catalog,
			ownerLogin: null,
		})
		stubGist({ holdings: [], guidelines: SHORTFALL.guidelines })
		const tool = createGetBuyPlanTool(credentials)

		const result = await tool.handler({ cashAmount: 1000 })

		const summary = withDiagnostics(
			JSON.parse(result.content[0].text) as BuyPlanSummary,
		)
		assert.equal(summary.cash.amount, 1000)
		// An empty portfolio has no currency to borrow, so the app default applies.
		assert.equal(summary.cash.currencySource, 'default')
	})

	it('rejects a missing or unparseable cashAmount as an argument error', async () => {
		const tool = createGetBuyPlanTool(credentials)
		await assert.rejects(
			async () => tool.handler({}),
			/"cashAmount" is required/,
		)
		await assert.rejects(
			async () => tool.handler({ cashAmount: 'lots' }),
			/must be a non-negative number/,
		)
	})

	it('rejects a currency the app does not support', async () => {
		setSharedCatalogForTests({
			entries: SHORTFALL.catalog,
			ownerLogin: null,
		})
		stubGist({ holdings: [], guidelines: SHORTFALL.guidelines })
		const tool = createGetBuyPlanTool(credentials)
		await assert.rejects(
			async () => tool.handler({ cashAmount: '100', cashCurrency: 'XYZ' }),
			/"cashCurrency" must be one of/,
		)
	})

	it('takes the currency argument case-insensitively', async () => {
		setSharedCatalogForTests({
			entries: SHORTFALL.catalog,
			ownerLogin: null,
		})
		stubGist({ holdings: [], guidelines: SHORTFALL.guidelines })
		const tool = createGetBuyPlanTool(credentials)

		const result = await tool.handler({
			cashAmount: '100',
			cashCurrency: 'eur',
		})

		const summary = withDiagnostics(
			JSON.parse(result.content[0].text) as BuyPlanSummary,
		)
		assert.equal(summary.cash.currency, 'EUR')
		assert.equal(summary.cash.currencySource, 'argument')
	})

	it('propagates a gist failure so the dispatcher marks it as a tool error', async () => {
		setSharedCatalogForTests({
			entries: SHORTFALL.catalog,
			ownerLogin: null,
		})
		globalThis.fetch = async () => new Response(null, { status: 404 })
		const tool = createGetBuyPlanTool(credentials)
		await assert.rejects(async () => tool.handler({ cashAmount: '100' }))
	})
})
