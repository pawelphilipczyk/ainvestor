import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
	ADVICE_BUY_NEXT_STORAGE_FILENAME,
	fetchStoredAdviceAnalysisForTab,
	fetchStoredAdviceAnalysisOutcomeForTab,
	parseStoredAdviceAnalysisFromGistFile,
	resetAdviceGistTestOverlay,
	setAdviceGistTestOverlay,
} from './advice-gist.ts'
import { DEFAULT_ADVICE_MODEL } from './advice-openai.ts'

afterEach(() => {
	resetAdviceGistTestOverlay()
})

describe('advice gist storage', () => {
	it('parseStoredAdviceAnalysisFromGistFile returns null for empty or invalid JSON', () => {
		assert.equal(parseStoredAdviceAnalysisFromGistFile(null), null)
		assert.equal(parseStoredAdviceAnalysisFromGistFile(''), null)
		assert.equal(parseStoredAdviceAnalysisFromGistFile('not json'), null)
	})

	it('parseStoredAdviceAnalysisFromGistFile accepts a minimal valid snapshot', () => {
		const raw = JSON.stringify({
			version: 1,
			savedAt: 1_700_000_000_000,
			lastAnalysisMode: 'portfolio_review',
			cashCurrency: 'PLN',
			selectedModel: 'gpt-5.6-sol',
			document: {
				blocks: [{ type: 'paragraph', text: 'Hello.' }],
			},
		})
		const parsed = parseStoredAdviceAnalysisFromGistFile(raw)
		assert.ok(parsed)
		assert.equal(parsed?.lastAnalysisMode, 'portfolio_review')
		assert.equal(parsed?.document.blocks[0]?.type, 'paragraph')
	})

	it('parseStoredAdviceAnalysisFromGistFile keeps snapshots saved under a retired model id', () => {
		const raw = JSON.stringify({
			version: 1,
			savedAt: 1_700_000_000_000,
			lastAnalysisMode: 'buy_next',
			cashCurrency: 'PLN',
			cashAmount: '100',
			selectedModel: 'gpt-5.4-mini',
			document: {
				blocks: [{ type: 'paragraph', text: 'Old advice.' }],
			},
		})
		const parsed = parseStoredAdviceAnalysisFromGistFile(raw)
		assert.ok(parsed)
		assert.equal(parsed?.selectedModel, DEFAULT_ADVICE_MODEL)
	})

	it('fetchStoredAdviceAnalysisForTab reads the matching tab from test overlay only', async () => {
		const buyNextStored = {
			version: 1 as const,
			savedAt: 1,
			lastAnalysisMode: 'buy_next' as const,
			cashCurrency: 'PLN',
			cashAmount: '100',
			selectedModel: 'gpt-5.6-sol' as const,
			activeTab: 'buy_next' as const,
			document: { blocks: [{ type: 'paragraph' as const, text: 'Buy' }] },
		}
		setAdviceGistTestOverlay(buyNextStored)
		const forBuy = await fetchStoredAdviceAnalysisForTab('t', 'g', 'buy_next')
		const forReview = await fetchStoredAdviceAnalysisForTab(
			't',
			'g',
			'portfolio_review',
		)
		assert.ok(forBuy)
		const firstBlock = forBuy.document.blocks[0]
		assert.equal(firstBlock?.type, 'paragraph')
		if (firstBlock?.type === 'paragraph') {
			assert.equal(firstBlock.text, 'Buy')
		}
		assert.equal(forReview, null)
	})

	it('fetchStoredAdviceAnalysisOutcomeForTab separates missing, malformed and unreadable', async () => {
		const originalFetch = globalThis.fetch
		try {
			globalThis.fetch = async () =>
				Response.json({
					files: {
						[ADVICE_BUY_NEXT_STORAGE_FILENAME]: { content: '{"version": 1,' },
					},
				})
			const malformed = await fetchStoredAdviceAnalysisOutcomeForTab(
				't',
				'g',
				'buy_next',
			)
			assert.equal(malformed.status, 'malformed')

			// The same gist holds nothing at all for the other tab, which is a
			// different answer from "there is something here I cannot read".
			const missing = await fetchStoredAdviceAnalysisOutcomeForTab(
				't',
				'g',
				'portfolio_review',
			)
			assert.equal(missing.status, 'not_found')

			globalThis.fetch = async () => new Response(null, { status: 401 })
			const unreadable = await fetchStoredAdviceAnalysisOutcomeForTab(
				't',
				'g',
				'buy_next',
			)
			assert.deepEqual(unreadable, { status: 'unreadable', httpStatus: 401 })
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})
