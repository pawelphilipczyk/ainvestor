import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseStoredAdviceAnalysisFromGistFile } from './advice-gist.ts'

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
})
