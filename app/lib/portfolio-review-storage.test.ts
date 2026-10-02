import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_ADVICE_MODEL } from '../features/advice/advice-openai.ts'
import {
	buildClearPortfolioReviewFilesPatch,
	PORTFOLIO_REVIEW_FILENAME,
	parsePortfolioReviewFromFiles,
} from './portfolio-review-storage.ts'

describe('portfolio-review-storage', () => {
	it('parsePortfolioReviewFromFiles returns null when file is missing', () => {
		assert.equal(parsePortfolioReviewFromFiles({ files: {} }), null)
	})

	it('parsePortfolioReviewFromFiles reads model and advice wrapper', () => {
		const advice = {
			blocks: [{ type: 'paragraph' as const, text: 'Hello review' }],
		}
		const stored = parsePortfolioReviewFromFiles({
			files: {
				[PORTFOLIO_REVIEW_FILENAME]: {
					content: JSON.stringify({
						model: 'gpt-5.6-sol',
						advice,
					}),
				},
			},
		})
		assert.ok(stored)
		assert.equal(stored.model, 'gpt-5.6-sol')
		assert.deepEqual(stored.advice, advice)
	})

	it('parsePortfolioReviewFromFiles accepts legacy bare AdviceDocument JSON', () => {
		const advice = {
			blocks: [{ type: 'paragraph' as const, text: 'Legacy' }],
		}
		const stored = parsePortfolioReviewFromFiles({
			files: {
				[PORTFOLIO_REVIEW_FILENAME]: {
					content: JSON.stringify(advice),
				},
			},
		})
		assert.ok(stored)
		assert.equal(stored.model, DEFAULT_ADVICE_MODEL)
		assert.deepEqual(stored.advice, advice)
	})

	it('buildClearPortfolioReviewFilesPatch nulls the file', () => {
		const patch = buildClearPortfolioReviewFilesPatch()
		assert.equal(patch.files[PORTFOLIO_REVIEW_FILENAME], null)
	})
})
