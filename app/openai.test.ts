import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EtfGuideline } from './lib/guidelines.ts'
import type { AdviceClient, EtfEntry } from './openai.ts'
import { getInvestmentAdvice } from './openai.ts'

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

		const advice = await getInvestmentAdvice(holdings, [], '1000', client)

		const first = advice.blocks[0]
		assert.equal(first?.type, 'paragraph')
		if (first?.type === 'paragraph') {
			assert.equal(first.text, 'Buy more VTI for broad diversification.')
		}
	})

	it('falls back to a single paragraph when the model returns plain text', async () => {
		const client = makeMockClient('Plain text without JSON.')
		const advice = await getInvestmentAdvice([], [], '100', client)

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

		await getInvestmentAdvice(holdings, [], '500', client)

		assert.match(capturedMessage, /VTI/)
		assert.match(capturedMessage, /5000 USD/)
		assert.match(capturedMessage, /VXUS/)
		assert.match(capturedMessage, /2000 EUR/)
		assert.match(capturedMessage, /\$500/)
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

		await getInvestmentAdvice([], [], '2000', client)

		assert.match(capturedMessage, /No ETFs recorded yet/)
		assert.match(capturedMessage, /\$2000/)
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

		const advice = await getInvestmentAdvice([], [], '100', client)

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

		await getInvestmentAdvice([], guidelines, '1000', client)

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

		await getInvestmentAdvice([], [], '500', client)

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

		await getInvestmentAdvice([], guidelines, '100', client)

		assert.match(capturedMessage, /Asset class equity.*bucket/)
		assert.match(capturedMessage, /VTI.*specific fund/)
	})
})
