import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EtfEntry } from '../../lib/gist.ts'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import type { CatalogEntry } from '../catalog/lib.ts'
import type { AdviceClient } from './advice-client.ts'
import {
	aggregateGuidelineTargetsByEtfType,
	computeAdviceAllocationDiagnostics,
	formatAdviceAllocationDiagnosticsBlock,
	formatAggregatedGuidelineBucketsBlock,
	formatAllocationContext,
	formatCatalogForAdvice,
	formatPostInvestmentTotalsBlock,
	getInvestmentAdvice,
	normalizeAdviceAnalysisTab,
	parseAdviceCashAmount,
} from './advice-openai.ts'

function adviceJsonParagraph(text: string): string {
	return JSON.stringify({ blocks: [{ type: 'paragraph', text }] })
}

function makeMockClient(responseText: string): AdviceClient {
	return {
		chat: {
			completions: {
				create: async () => ({
					choices: [{ message: { content: responseText } }],
				}),
			},
		},
	}
}

describe('getInvestmentAdvice', () => {
	it('returns paragraph blocks from the LLM JSON response', async () => {
		const client = makeMockClient(
			adviceJsonParagraph('Buy more VTI for broad diversification.'),
		)
		const holdings: EtfEntry[] = [
			{ id: '1', name: 'VTI', value: 5000, currency: 'USD' },
		]

		const advice = await getInvestmentAdvice({
			holdings,
			guidelines: [],
			cashAmount: '1000',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		const first = advice.blocks[0]
		assert.equal(first?.type, 'paragraph')
		if (first?.type === 'paragraph') {
			assert.equal(first.text, 'Buy more VTI for broad diversification.')
		}
	})

	it('uses gpt-5.4-mini by default and forwards the chosen model to the client', async () => {
		let defaultModel = ''
		const defaultClient: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						defaultModel = params.model
						return {
							choices: [{ message: { content: adviceJsonParagraph('ok') } }],
						}
					},
				},
			},
		}
		await getInvestmentAdvice({
			holdings: [],
			guidelines: [],
			cashAmount: '100',
			cashCurrency: 'PLN',
			catalog: [],
			client: defaultClient,
		})
		assert.equal(defaultModel, 'gpt-5.4-mini')

		let chosenModel = ''
		const trackingClient: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						chosenModel = params.model
						return {
							choices: [{ message: { content: adviceJsonParagraph('ok') } }],
						}
					},
				},
			},
		}
		await getInvestmentAdvice({
			holdings: [],
			guidelines: [],
			cashAmount: '100',
			cashCurrency: 'PLN',
			catalog: [],
			client: trackingClient,
			model: 'gpt-5.4',
		})
		assert.equal(chosenModel, 'gpt-5.4')
	})

	it('falls back to a single paragraph when the model returns plain text', async () => {
		const client = makeMockClient('Plain text without JSON.')
		const advice = await getInvestmentAdvice({
			holdings: [],
			guidelines: [],
			cashAmount: '100',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		const first = advice.blocks[0]
		assert.equal(first?.type, 'paragraph')
		if (first?.type === 'paragraph') {
			assert.equal(first.text, 'Plain text without JSON.')
		}
	})

	it('describes holdings with name, value and currency', async () => {
		let capturedMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedMessage = params.messages[1].content
						return {
							choices: [{ message: { content: adviceJsonParagraph('x') } }],
						}
					},
				},
			},
		}

		const holdings: EtfEntry[] = [
			{ id: '1', name: 'VTI', value: 5000, currency: 'USD' },
			{ id: '2', name: 'VXUS', value: 2000, currency: 'EUR' },
		]

		await getInvestmentAdvice({
			holdings,
			guidelines: [],
			cashAmount: '500',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		assert.match(capturedMessage, /VTI/)
		assert.match(capturedMessage, /5000 USD/)
		assert.match(capturedMessage, /VXUS/)
		assert.match(capturedMessage, /2000 EUR/)
		assert.match(capturedMessage, /500 PLN/)
	})

	it('handles empty holdings gracefully', async () => {
		let capturedMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedMessage = params.messages[1].content
						return {
							choices: [
								{
									message: { content: adviceJsonParagraph('Start with VTI.') },
								},
							],
						}
					},
				},
			},
		}

		await getInvestmentAdvice({
			holdings: [],
			guidelines: [],
			cashAmount: '2000',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		assert.match(capturedMessage, /No ETFs recorded yet/)
		assert.match(capturedMessage, /2000 PLN/)
	})

	it('returns fallback text when LLM returns null content', async () => {
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async () => ({
						choices: [{ message: { content: null } }],
					}),
				},
			},
		}

		const advice = await getInvestmentAdvice({
			holdings: [],
			guidelines: [],
			cashAmount: '100',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		const first = advice.blocks[0]
		assert.equal(first?.type, 'paragraph')
		if (first?.type === 'paragraph') {
			assert.equal(first.text, 'No advice available.')
		}
	})

	it('returns fallback text when LLM returns an empty choices array', async () => {
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async () => ({
						choices: [],
					}),
				},
			},
		}

		const advice = await getInvestmentAdvice({
			holdings: [],
			guidelines: [],
			cashAmount: '100',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		const first = advice.blocks[0]
		assert.equal(first?.type, 'paragraph')
		if (first?.type === 'paragraph') {
			assert.equal(first.text, 'No advice available.')
		}
	})

	it('includes guidelines as target allocation in the user message', async () => {
		let capturedMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedMessage = params.messages[1].content
						return {
							choices: [
								{ message: { content: adviceJsonParagraph('advice') } },
							],
						}
					},
				},
			},
		}

		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 60,
				etfType: 'equity',
			},
			{
				id: 'g2',
				kind: 'instrument',
				etfName: 'BND',
				targetPct: 30,
				etfType: 'bond',
			},
		]

		await getInvestmentAdvice({
			holdings: [],
			guidelines,
			cashAmount: '1000',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		assert.match(capturedMessage, /VTI.*60%/)
		assert.match(capturedMessage, /BND.*30%/)
		assert.match(capturedMessage, /equity/)
		assert.match(capturedMessage, /bond/)
		assert.match(capturedMessage, /split of the new cash alone/i)
		assert.match(capturedMessage, /whole ETF portfolio/i)
	})

	it('omits the target allocation block when guidelines are empty', async () => {
		let capturedMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedMessage = params.messages[1].content
						return {
							choices: [
								{ message: { content: adviceJsonParagraph('advice') } },
							],
						}
					},
				},
			},
		}

		await getInvestmentAdvice({
			holdings: [],
			guidelines: [],
			cashAmount: '500',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		assert.doesNotMatch(capturedMessage, /target allocation/i)
		assert.doesNotMatch(capturedMessage, /whole ETF portfolio/i)
	})

	it('formats hybrid asset-class and instrument lines in the user message', async () => {
		let capturedMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedMessage = params.messages[1].content
						return {
							choices: [
								{ message: { content: adviceJsonParagraph('advice') } },
							],
						}
					},
				},
			},
		}

		const guidelines: EtfGuideline[] = [
			{
				id: 'a1',
				kind: 'asset_class',
				etfName: '',
				targetPct: 60,
				etfType: 'equity',
			},
			{
				id: 'g1',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 20,
				etfType: 'equity',
			},
		]

		await getInvestmentAdvice({
			holdings: [],
			guidelines,
			cashAmount: '100',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		assert.match(capturedMessage, /Asset class equity.*bucket/)
		assert.match(capturedMessage, /VTI.*specific fund/)
		assert.match(capturedMessage, /Effective target % by asset class/)
		assert.match(capturedMessage, /equity: \*\*80%\*\*/)
		assert.match(capturedMessage, /Server allocation diagnostics/)
	})

	it('includes allocation context and ETF catalog in the user message', async () => {
		let capturedMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedMessage = params.messages[1].content
						return { choices: [{ message: { content: 'ok' } }] }
					},
				},
			},
		}

		const catalog: CatalogEntry[] = [
			{
				id: 'c1',
				ticker: 'VTI',
				name: 'Vanguard Total Stock Market',
				type: 'equity',
				description: 'US broad market',
				rate_of_return: 7.5,
				return_risk: '1.2',
			},
		]

		await getInvestmentAdvice({
			holdings: [
				{ id: '1', name: 'VTI', ticker: 'VTI', value: 5000, currency: 'USD' },
			],
			guidelines: [],
			cashAmount: '250',
			cashCurrency: 'PLN',
			catalog,
			client,
		})

		assert.match(capturedMessage, /Allocation context/)
		assert.match(capturedMessage, /Arithmetic for totals \(authoritative/)
		assert.match(capturedMessage, /Deployable cash/)
		assert.match(capturedMessage, /not included in the ETF totals above/i)
		assert.match(capturedMessage, /ETF catalog/)
		assert.match(capturedMessage, /VTI — Vanguard Total Stock Market/)
		assert.match(capturedMessage, /annual rate of return: 7\.5%/)
		assert.match(capturedMessage, /equity/)
	})

	it('includes server allocation diagnostics for asset-class bucket guidelines', async () => {
		let capturedMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedMessage = params.messages[1].content
						return { choices: [{ message: { content: 'ok' } }] }
					},
				},
			},
		}

		const catalog: CatalogEntry[] = [
			{
				id: 'c1',
				ticker: 'X',
				name: 'Eq',
				type: 'equity',
				description: '',
			},
			{
				id: 'c2',
				ticker: 'Y',
				name: 'Bd',
				type: 'bond',
				description: '',
			},
		]
		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'asset_class',
				etfName: '',
				targetPct: 60,
				etfType: 'equity',
			},
			{
				id: 'g2',
				kind: 'asset_class',
				etfName: '',
				targetPct: 40,
				etfType: 'bond',
			},
		]

		await getInvestmentAdvice({
			holdings: [
				{ id: '1', name: 'X', ticker: 'X', value: 4000, currency: 'PLN' },
			],
			guidelines,
			cashAmount: '1000',
			cashCurrency: 'PLN',
			catalog,
			client,
		})

		assert.match(capturedMessage, /Server allocation diagnostics/)
	})

	it('portfolio_review uses the review system prompt and omits cash deployment', async () => {
		let systemPrompt = ''
		let userMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						systemPrompt = params.messages[0].content
						userMessage = params.messages[1].content
						return {
							choices: [{ message: { content: adviceJsonParagraph('ok') } }],
						}
					},
				},
			},
		}

		await getInvestmentAdvice({
			holdings: [
				{ id: '1', name: 'VTI', ticker: 'VTI', value: 5000, currency: 'USD' },
			],
			guidelines: [],
			cashAmount: '0',
			cashCurrency: 'PLN',
			catalog: [],
			client,
			analysisMode: 'portfolio_review',
		})

		assert.match(systemPrompt, /qualitative review/i)
		assert.match(systemPrompt, /Do \*\*not\*\* include "etf_proposals"/)
		assert.match(userMessage, /Allocation context/)
		assert.match(userMessage, /ETF catalog/)
		assert.doesNotMatch(userMessage, /Deployable cash/)
		assert.doesNotMatch(userMessage, /Hard constraint \(mandatory\)/)
	})

	it('portfolio_review compares to guidelines when present', async () => {
		let userMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						userMessage = params.messages[1].content
						return {
							choices: [{ message: { content: adviceJsonParagraph('ok') } }],
						}
					},
				},
			},
		}

		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'asset_class',
				etfName: '',
				targetPct: 70,
				etfType: 'equity',
			},
		]

		await getInvestmentAdvice({
			holdings: [],
			guidelines,
			cashAmount: '100',
			cashCurrency: 'PLN',
			catalog: [],
			client,
			analysisMode: 'portfolio_review',
		})

		assert.match(userMessage, /intended long-term mix/)
		assert.match(userMessage, /70%/)
	})

	it('includes mandatory buy-only constraint in the user message', async () => {
		let capturedMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedMessage = params.messages[1].content
						return { choices: [{ message: { content: 'ok' } }] }
					},
				},
			},
		}

		await getInvestmentAdvice({
			holdings: [],
			guidelines: [],
			cashAmount: '100',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		assert.match(capturedMessage, /Hard constraint \(mandatory\)/)
		assert.match(capturedMessage, /\*\*cannot sell\*\*/i)
	})

	it('includes empty-catalog guidance when the catalog has no rows', async () => {
		let capturedMessage = ''
		const client: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedMessage = params.messages[1].content
						return { choices: [{ message: { content: 'ok' } }] }
					},
				},
			},
		}

		await getInvestmentAdvice({
			holdings: [{ id: '1', name: 'FOO', value: 100, currency: 'USD' }],
			guidelines: [],
			cashAmount: '50',
			cashCurrency: 'PLN',
			catalog: [],
			client,
		})

		assert.match(capturedMessage, /No ETF catalog entries/)
	})
})

describe('formatAllocationContext', () => {
	it('groups holdings by catalog asset type', () => {
		const catalog: CatalogEntry[] = [
			{
				id: 'c1',
				ticker: 'VTI',
				name: 'US',
				type: 'equity',
				description: '',
			},
			{
				id: 'c2',
				ticker: 'BND',
				name: 'Bond',
				type: 'bond',
				description: '',
			},
		]
		const holdings: EtfEntry[] = [
			{ id: 'a', name: 'VTI', ticker: 'VTI', value: 6000, currency: 'USD' },
			{ id: 'b', name: 'BND', ticker: 'BND', value: 4000, currency: 'USD' },
		]
		const formatted = formatAllocationContext(holdings, catalog)
		assert.match(formatted, /equity.*60/)
		assert.match(formatted, /bond.*40/)
	})
})

describe('normalizeAdviceAnalysisTab', () => {
	it('returns known modes and defaults for unknown', () => {
		assert.equal(normalizeAdviceAnalysisTab('buy_next'), 'buy_next')
		assert.equal(
			normalizeAdviceAnalysisTab('portfolio_review'),
			'portfolio_review',
		)
		assert.equal(normalizeAdviceAnalysisTab(undefined), 'buy_next')
		assert.equal(normalizeAdviceAnalysisTab(null), 'buy_next')
		assert.equal(normalizeAdviceAnalysisTab(''), 'buy_next')
		assert.equal(normalizeAdviceAnalysisTab('nope'), 'buy_next')
	})
})

describe('parseAdviceCashAmount', () => {
	it('parses integers and decimals with common separators', () => {
		assert.equal(parseAdviceCashAmount('2000'), 2000)
		assert.equal(parseAdviceCashAmount(' 2000 '), 2000)
		assert.equal(parseAdviceCashAmount('2,000'), 2000)
		assert.equal(parseAdviceCashAmount('2000.50'), 2000.5)
		assert.equal(parseAdviceCashAmount('2.000,50'), 2000.5)
	})

	it('returns null for empty or invalid', () => {
		assert.equal(parseAdviceCashAmount(''), null)
		assert.equal(parseAdviceCashAmount('abc'), null)
		assert.equal(parseAdviceCashAmount('-1'), null)
	})
})

describe('computeAdviceAllocationDiagnostics', () => {
	it('matches buy-only proportional deployment when cash is below sum of minimum buys (30/40/30 example)', () => {
		const catalog: CatalogEntry[] = [
			{
				id: '1',
				ticker: 'A',
				name: 'A',
				type: 'equity',
				description: '',
			},
			{
				id: '2',
				ticker: 'B',
				name: 'B',
				type: 'bond',
				description: '',
			},
			{
				id: '3',
				ticker: 'C',
				name: 'C',
				type: 'commodity',
				description: '',
			},
		]
		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'asset_class',
				etfName: '',
				targetPct: 30,
				etfType: 'equity',
			},
			{
				id: 'g2',
				kind: 'asset_class',
				etfName: '',
				targetPct: 40,
				etfType: 'bond',
			},
			{
				id: 'g3',
				kind: 'asset_class',
				etfName: '',
				targetPct: 30,
				etfType: 'commodity',
			},
		]
		const holdings: EtfEntry[] = [
			{ id: 'h1', name: 'A', ticker: 'A', value: 2000, currency: 'PLN' },
			{ id: 'h2', name: 'B', ticker: 'B', value: 3000, currency: 'PLN' },
			{ id: 'h3', name: 'C', ticker: 'C', value: 5000, currency: 'PLN' },
		]
		const diagnostics = computeAdviceAllocationDiagnostics({
			holdings,
			guidelines,
			cashAmount: '5000',
			cashCurrency: 'PLN',
			catalog,
		})
		assert.ok(diagnostics)
		assert.equal(diagnostics.postTotal, 15000)
		const equityRow = diagnostics.rows.find((row) => row.etfType === 'equity')
		const bondRow = diagnostics.rows.find((row) => row.etfType === 'bond')
		const commodityRow = diagnostics.rows.find(
			(row) => row.etfType === 'commodity',
		)
		assert.ok(equityRow && bondRow && commodityRow)
		assert.equal(equityRow.idealBuyMin, 2500)
		assert.equal(bondRow.idealBuyMin, 3000)
		assert.equal(commodityRow.idealBuyMin, 0)
		assert.equal(diagnostics.sumIdealBuyMin, 5500)

		const block = formatAdviceAllocationDiagnosticsBlock({
			holdings,
			guidelines,
			cashAmount: '5000',
			cashCurrency: 'PLN',
			catalog,
		})
		assert.ok(block)
		assert.match(block, /Server allocation diagnostics/)
		assert.match(block, /Buy-only/)
		assert.match(block, /deploy ~2272\.73 PLN/)
		assert.match(block, /deploy ~2727\.27 PLN/)
	})

	it('aggregates hybrid equity bucket + instrument into one class target (100% equity)', () => {
		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'asset_class',
				etfName: '',
				targetPct: 50,
				etfType: 'equity',
			},
			{
				id: 'g2',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 50,
				etfType: 'equity',
			},
		]
		const diagnostics = computeAdviceAllocationDiagnostics({
			holdings: [],
			guidelines,
			cashAmount: '100',
			cashCurrency: 'PLN',
			catalog: [],
		})
		assert.ok(diagnostics)
		assert.equal(diagnostics.rows.length, 1)
		assert.equal(diagnostics.rows[0]?.etfType, 'equity')
		assert.equal(diagnostics.rows[0]?.targetPct, 100)
		assert.equal(diagnostics.targetPctSum, 100)
	})

	it('sums multiple instrument lines of the same type into one bucket', () => {
		const { byType, sumAll } = aggregateGuidelineTargetsByEtfType([
			{
				id: 'a',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 40,
				etfType: 'equity',
			},
			{
				id: 'b',
				kind: 'instrument',
				etfName: 'VXUS',
				targetPct: 20,
				etfType: 'equity',
			},
			{
				id: 'c',
				kind: 'instrument',
				etfName: 'BND',
				targetPct: 40,
				etfType: 'bond',
			},
		])
		assert.equal(sumAll, 100)
		assert.equal(byType.get('equity'), 60)
		assert.equal(byType.get('bond'), 40)
	})

	it('infers etfType from instrument guideline when catalog has no match', () => {
		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 100,
				etfType: 'equity',
			},
		]
		const diagnostics = computeAdviceAllocationDiagnostics({
			holdings: [
				{ id: 'h1', name: 'VTI', ticker: 'VTI', value: 5000, currency: 'PLN' },
			],
			guidelines,
			cashAmount: '5000',
			cashCurrency: 'PLN',
			catalog: [],
		})
		assert.ok(diagnostics)
		const equityRow = diagnostics.rows.find((row) => row.etfType === 'equity')
		assert.ok(equityRow)
		assert.equal(equityRow.currentAmt, 5000)
	})

	it('returns null when a valued holding cannot be mapped to a targeted type', () => {
		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'asset_class',
				etfName: '',
				targetPct: 100,
				etfType: 'equity',
			},
		]
		assert.equal(
			computeAdviceAllocationDiagnostics({
				holdings: [
					{
						id: 'h1',
						name: 'Unknown Fund',
						ticker: 'ZZZ',
						value: 1000,
						currency: 'PLN',
					},
				],
				guidelines,
				cashAmount: '100',
				cashCurrency: 'PLN',
				catalog: [],
			}),
			null,
		)
	})

	it('diagnostics row shows normalized target % with raw ratio when guideline sum ≠ 100', () => {
		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'asset_class',
				etfName: '',
				targetPct: 40,
				etfType: 'equity',
			},
			{
				id: 'g2',
				kind: 'asset_class',
				etfName: '',
				targetPct: 40,
				etfType: 'bond',
			},
		]
		const block = formatAdviceAllocationDiagnosticsBlock({
			holdings: [],
			guidelines,
			cashAmount: '1000',
			cashCurrency: 'PLN',
			catalog: [],
		})
		assert.ok(block)
		assert.match(block, /equity: target 50\.00% \(40\/80\)/)
		assert.match(block, /bond: target 50\.00% \(40\/80\)/)
	})

	it('formatAggregatedGuidelineBucketsBlock lists combined class totals', () => {
		const block = formatAggregatedGuidelineBucketsBlock([
			{
				id: 'a',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 30,
				etfType: 'equity',
			},
			{
				id: 'b',
				kind: 'asset_class',
				etfName: '',
				targetPct: 30,
				etfType: 'equity',
			},
			{
				id: 'c',
				kind: 'asset_class',
				etfName: '',
				targetPct: 40,
				etfType: 'bond',
			},
		])
		assert.ok(block)
		assert.match(block, /equity: \*\*60%\*\*/)
		assert.match(block, /bond: \*\*40%\*\*/)
	})
})

describe('formatPostInvestmentTotalsBlock', () => {
	it('sums holdings and cash in one currency for post-investment total', () => {
		const holdings: EtfEntry[] = [
			{ id: '1', name: 'BND', value: 1000, currency: 'PLN' },
		]
		const formatted = formatPostInvestmentTotalsBlock({
			holdings,
			cashAmount: '2000',
			cashCurrency: 'PLN',
		})
		assert.match(formatted, /1000\.00 \+ 2000\.00 = 3000\.00 PLN/)
	})

	it('does not combine totals when cash currency differs from holdings', () => {
		const holdings: EtfEntry[] = [
			{ id: '1', name: 'BND', value: 1000, currency: 'USD' },
		]
		const formatted = formatPostInvestmentTotalsBlock({
			holdings,
			cashAmount: '2000',
			cashCurrency: 'PLN',
		})
		assert.doesNotMatch(formatted, /= 3000/)
		assert.match(formatted, /do not add into one combined total/i)
	})
})

describe('formatCatalogForAdvice', () => {
	it('includes performance fields when present', () => {
		const catalog: CatalogEntry[] = [
			{
				id: 'c1',
				ticker: 'X',
				name: 'Test',
				type: 'equity',
				description: 'd',
				rate_of_return: 5,
				volatility: '10%',
			},
		]
		const formatted = formatCatalogForAdvice(catalog)
		assert.match(formatted, /annual rate of return: 5%/)
		assert.match(formatted, /volatility: 10%/)
	})
})
