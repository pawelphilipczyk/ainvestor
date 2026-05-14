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

	it('document starts with the export title and contains all three section headers', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'All good.' }],
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
				}),
		)
		assert.ok(
			text.startsWith('AI advice — validation export'),
			'document title should be first line',
		)
		assert.match(text, /=== Guidelines \(saved targets\) ===/)
		assert.match(text, /=== Portfolio \(saved holdings\) ===/)
		assert.match(text, /=== Advice output \(structured\) ===/)
	})

	it('shows empty guidelines placeholder when no guidelines provided', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Some advice.' }],
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
				}),
		)
		assert.match(text, /\(No allocation guidelines configured\.\)/)
	})

	it('shows empty portfolio placeholder when no holdings provided', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Empty portfolio.' }],
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
				}),
		)
		assert.match(text, /\(No ETF holdings in the saved portfolio\.\)/)
	})

	it('formats holding without ticker without parenthetical', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Note.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [
						{
							id: 'h1',
							name: 'No Ticker Fund',
							value: 2500,
							currency: 'EUR',
						},
					],
					model: 'gpt-5.4',
					analysisMode: 'portfolio_review',
				}),
		)
		assert.match(text, /- No Ticker Fund: 2,500\.00 EUR/)
		assert.doesNotMatch(text, /No Ticker Fund \(/)
	})

	it('formats holding with whitespace-only ticker without parenthetical', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Note.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [
						{
							id: 'h1',
							name: 'Blank Ticker Fund',
							ticker: '   ',
							value: 1000,
							currency: 'PLN',
						},
					],
					model: 'gpt-5.4',
					analysisMode: 'portfolio_review',
				}),
		)
		assert.match(text, /- Blank Ticker Fund: 1,000\.00 PLN/)
		assert.doesNotMatch(text, /Blank Ticker Fund \(/)
	})

	it('formats multiple holdings in order', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Note.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [
						{ id: 'h1', name: 'Alpha ETF', ticker: 'ALPH', value: 1000, currency: 'PLN' },
						{ id: 'h2', name: 'Beta ETF', ticker: 'BETA', value: 2000, currency: 'EUR' },
					],
					model: 'gpt-5.4',
					analysisMode: 'portfolio_review',
				}),
		)
		assert.match(text, /Alpha ETF \(ALPH\): 1,000\.00 PLN/)
		assert.match(text, /Beta ETF \(BETA\): 2,000\.00 EUR/)
		assert.ok(
			text.indexOf('Alpha ETF') < text.indexOf('Beta ETF'),
			'Alpha ETF should appear before Beta ETF',
		)
	})

	it('omits cash line for buy_next when cashAmount is empty string', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Buy something.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4-mini',
					analysisMode: 'buy_next',
					cashAmount: '',
					cashCurrency: 'PLN',
				}),
		)
		assert.doesNotMatch(text, /Deployable cash/)
	})

	it('omits cash line for buy_next when cashAmount is whitespace only', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Buy something.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4-mini',
					analysisMode: 'buy_next',
					cashAmount: '   ',
					cashCurrency: 'PLN',
				}),
		)
		assert.doesNotMatch(text, /Deployable cash/)
	})

	it('omits cash line for buy_next when cashAmount is undefined', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Buy something.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4-mini',
					analysisMode: 'buy_next',
				}),
		)
		assert.doesNotMatch(text, /Deployable cash/)
	})

	it('defaults cashCurrency to PLN when cashCurrency is undefined', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Buy now.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4-mini',
					analysisMode: 'buy_next',
					cashAmount: '500',
					cashCurrency: undefined,
				}),
		)
		assert.match(text, /Deployable cash: 500 PLN/)
	})

	it('renders correct label for gpt-5.5 model', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Advice text.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.5',
					analysisMode: 'portfolio_review',
				}),
		)
		assert.match(text, /Model: GPT-5\.5/)
	})

	it('renders correct label for gpt-5.4-nano model', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Advice text.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4-nano',
					analysisMode: 'portfolio_review',
				}),
		)
		assert.match(text, /Model: GPT-5\.4 Nano/)
	})

	it('renders capital_snapshot block with labelled segments and role', () => {
		const advice: AdviceDocument = {
			blocks: [
				{
					type: 'capital_snapshot',
					segments: [
						{ role: 'holdings', label: 'Existing ETFs', amount: 8000, currency: 'PLN' },
						{ role: 'cash', label: 'Cash to deploy', amount: 2000, currency: 'PLN' },
					],
				},
			],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4',
					analysisMode: 'buy_next',
					cashAmount: '2000',
					cashCurrency: 'PLN',
				}),
		)
		assert.match(text, /\[Portfolio mix snapshot\]/)
		assert.match(text, /- Existing ETFs: 8,000\.00 PLN \(holdings\)/)
		assert.match(text, /- Cash to deploy: 2,000\.00 PLN \(cash\)/)
	})

	it('renders capital_snapshot block with postTotal when present', () => {
		const advice: AdviceDocument = {
			blocks: [
				{
					type: 'capital_snapshot',
					segments: [
						{ role: 'holdings', label: 'ETFs', amount: 5000, currency: 'EUR' },
					],
					postTotal: { label: 'Total after buys', amount: 6000, currency: 'EUR' },
				},
			],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4',
					analysisMode: 'buy_next',
					cashAmount: '1000',
					cashCurrency: 'EUR',
				}),
		)
		assert.match(text, /- Total after buys: 6,000\.00 EUR/)
	})

	it('renders guideline_bars block with caption, current, target, and postBuyPct', () => {
		const advice: AdviceDocument = {
			blocks: [
				{
					type: 'guideline_bars',
					caption: 'Asset allocation',
					rows: [
						{ label: 'Equity', currentPct: 55, targetPct: 60, postBuyPct: 61 },
					],
				},
			],
		}
		const text = runWithUiCopyContext(
			{ locale: 'en', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4',
					analysisMode: 'buy_next',
					cashAmount: '1000',
					cashCurrency: 'PLN',
				}),
		)
		assert.match(text, /\[Guideline alignment bars\]/)
		assert.match(text, /Asset allocation/)
		assert.match(text, /- Equity: 55% → 60% → 61%/)
	})

	it('renders guideline_bars block without caption when caption is absent', () => {
		const advice: AdviceDocument = {
			blocks: [
				{
					type: 'guideline_bars',
					rows: [
						{ label: 'Bonds', currentPct: 30, targetPct: 40 },
					],
				},
			],
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
				}),
		)
		assert.match(text, /\[Guideline alignment bars\]/)
		assert.match(text, /- Bonds: 30% → 40%/)
		assert.doesNotMatch(text, /- Bonds: 30% → 40% →/)
	})

	it('renders guideline_bars without postBuyPct suffix when postBuyPct is absent', () => {
		const advice: AdviceDocument = {
			blocks: [
				{
					type: 'guideline_bars',
					rows: [{ label: 'Real Estate', currentPct: 10, targetPct: 15 }],
				},
			],
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
				}),
		)
		assert.match(text, /- Real Estate: 10% → 15%$/)
	})

	it('renders etf_proposals with caption and formats row pipe-separated', () => {
		const advice: AdviceDocument = {
			blocks: [
				{
					type: 'etf_proposals',
					caption: 'Suggested buys',
					rows: [
						{
							name: 'Gold ETF',
							ticker: 'GOLD',
							amount: 300,
							currency: 'EUR',
							note: 'new position',
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
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4-mini',
					analysisMode: 'buy_next',
					cashAmount: '500',
					cashCurrency: 'EUR',
				}),
		)
		assert.match(text, /\[ETF proposals\]/)
		assert.match(text, /Suggested buys/)
		assert.match(text, /- Gold ETF \| GOLD \| 300\.00 EUR \| new position/)
	})

	it('renders etf_proposals row with empty strings when ticker, note, amount absent', () => {
		const advice: AdviceDocument = {
			blocks: [
				{
					type: 'etf_proposals',
					rows: [
						{
							name: 'Unnamed ETF',
							ticker: undefined,
							amount: undefined,
							currency: undefined,
							note: undefined,
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
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4',
					analysisMode: 'portfolio_review',
				}),
		)
		assert.match(text, /- Unnamed ETF \|  \|  \s* \| /)
	})

	it('produces Polish locale output with Polish section titles', () => {
		const advice: AdviceDocument = {
			blocks: [{ type: 'paragraph', text: 'Dobra decyzja.' }],
		}
		const text = runWithUiCopyContext(
			{ locale: 'pl', shellReturnPath: '/' },
			() =>
				buildAdviceValidationExportText({
					advice,
					guidelines: [],
					holdings: [],
					model: 'gpt-5.4-mini',
					analysisMode: 'buy_next',
					cashAmount: '750',
					cashCurrency: 'PLN',
				}),
		)
		assert.match(text, /Porada AI — eksport do walidacji/)
		assert.match(text, /Gotówka do ulokowania: 750 PLN/)
		assert.match(text, /=== Wytyczne \(zapisane cele\) ===/)
		assert.match(text, /=== Portfel \(zapisane pozycje\) ===/)
	})
})
