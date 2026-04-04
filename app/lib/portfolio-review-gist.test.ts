import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	buildClearPortfolioReviewGistPatch,
	PORTFOLIO_REVIEW_FILENAME,
	parsePortfolioReviewFromGist,
} from './portfolio-review-gist.ts'

describe('portfolio-review-gist', () => {
	it('parsePortfolioReviewFromGist returns null when file is missing', () => {
		assert.equal(parsePortfolioReviewFromGist({ files: {} }), null)
	})

	it('parsePortfolioReviewFromGist reads model and advice wrapper', () => {
		const advice = {
			blocks: [{ type: 'paragraph' as const, text: 'Hello review' }],
		}
		const stored = parsePortfolioReviewFromGist({
			files: {
				[PORTFOLIO_REVIEW_FILENAME]: {
					content: JSON.stringify({
						model: 'gpt-5.4-mini',
						advice,
					}),
				},
			},
		})
		assert.ok(stored)
		assert.equal(stored.model, 'gpt-5.4-mini')
		assert.deepEqual(stored.advice, advice)
	})

	it('parsePortfolioReviewFromGist accepts legacy bare AdviceDocument JSON', () => {
		const advice = {
			blocks: [{ type: 'paragraph' as const, text: 'Legacy' }],
		}
		const stored = parsePortfolioReviewFromGist({
			files: {
				[PORTFOLIO_REVIEW_FILENAME]: {
					content: JSON.stringify(advice),
				},
			},
		})
		assert.ok(stored)
		assert.equal(stored.model, 'gpt-5.4-mini')
		assert.deepEqual(stored.advice, advice)
	})

	it('buildClearPortfolioReviewGistPatch nulls the file', () => {
		const patch = buildClearPortfolioReviewGistPatch()
		assert.equal(patch.files[PORTFOLIO_REVIEW_FILENAME], null)
	})
})
