import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runWithUiCopyContext } from '../../lib/ui-locale.ts'
import type { AdviceDocument } from './advice-document.ts'
import { buildAdviceValidationExportText } from './advice-validation-export.ts'

describe('buildAdviceValidationExportText', () => {
	it('includes guidelines, portfolio, advice blocks, model, mode, and cash for buy_next', () => {
		const advice: AdviceDocument = {
			blocks: [
				{ type: 'paragraph', text: 'Buy more bonds.' },
				{
					type: 'etf_proposals',
					caption: 'Trades',
					rows: [
						{
							name: 'Bond ETF',
							ticker: 'BND',
							catalogEntryId: undefined,
							amount: 100,
							currency: 'PLN',
							note: 'rebalance',
						},
					],
				},
			],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [
						{
							id: '1',
							kind: 'asset_class',
							etfName: '',
							targetPct: 60,
							etfType: 'equity',
						},
					],
					holdings: [
						{
							id: 'h1',
							name: 'Stock ETF',
							ticker: 'STK',
							value: 4000,
							currency: 'PLN',
						},
					],
					model: 'gpt-5.4-mini',
					analysisMode: 'buy_next',
					cashAmount: '1000',
					cashCurrency: 'PLN',
				}),
		)
		assert.match(text, /GPT-5\.4 Mini/)
		assert.match(text, /What to buy next/)
		assert.match(text, /1000.*PLN/s)
		assert.match(text, /Stock ETF \(STK\): 4,000\.00 PLN/)
		assert.match(text, /Buy more bonds/)
		assert.match(text, /Bond ETF \| BND \| 100\.00 PLN \| rebalance/)
	})

	it('omits cash line for portfolio_review', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Looks fine.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4',
					analysisMode: 'portfolio_review',
					cashAmount: '999',
					cashCurrency: 'EUR',
				}),
		)
		assert.doesNotMatch(text, /999/)
		assert.match(text, /Portfolio health review/)
	})
})
