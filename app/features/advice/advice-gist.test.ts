import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
	fetchStoredAdviceAnalysisForTab,
	parseStoredAdviceAnalysisFromGistFile,
	resetAdviceGistTestOverlay,
	setAdviceGistTestOverlay,
} from './advice-gist.ts'

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
			selectedModel: 'gpt-5.4-mini',
			document: {
				blocks: [{ type: 'paragraph', text: 'Hello.' }],
			},
		})
		const parsed = parseStoredAdviceAnalysisFromGistFile(raw)
		assert.ok(parsed)
		assert.equal(parsed?.lastAnalysisMode, 'portfolio_review')
		assert.equal(parsed?.document.blocks[0]?.type, 'paragraph')
	})

	it('fetchStoredAdviceAnalysisForTab reads the matching tab from test overlay only', async () => {
		const buyNextStored = {
			version: 1 as const,
			savedAt: 1,
			lastAnalysisMode: 'buy_next' as const,
			cashCurrency: 'PLN',
			cashAmount: '100',
			selectedModel: 'gpt-5.4-mini' as const,
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
		assert.equal(forBuy?.document.blocks[0]?.text, 'Buy')
		assert.equal(forReview, null)
	})
})
