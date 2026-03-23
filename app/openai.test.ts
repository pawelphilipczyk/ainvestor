import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CatalogEntry } from './features/catalog/lib.ts'
import type { EtfGuideline } from './lib/guidelines.ts'
import type { AdviceClient, EtfEntry } from './openai.ts'
import {
	formatAllocationContext,
	formatCatalogForAdvice,
	getInvestmentAdvice,
} from './openai.ts'

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
		assert.match(capturedMessage, /Deployable cash/)
		assert.match(capturedMessage, /not included in the ETF totals above/i)
		assert.match(capturedMessage, /ETF catalog/)
		assert.match(capturedMessage, /VTI — Vanguard Total Stock Market/)
		assert.match(capturedMessage, /annual rate of return: 7\.5%/)
		assert.match(capturedMessage, /equity/)
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
		const out = formatAllocationContext(holdings, catalog)
		assert.match(out, /equity.*60/)
		assert.match(out, /bond.*40/)
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
		const out = formatCatalogForAdvice(catalog)
		assert.match(out, /annual rate of return: 5%/)
		assert.match(out, /volatility: 10%/)
	})
})
