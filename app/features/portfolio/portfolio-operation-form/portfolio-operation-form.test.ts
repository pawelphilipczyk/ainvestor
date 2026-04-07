import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSafe } from 'remix/data-schema'
import {
	normalizePortfolioOperationInput,
	PortfolioBuyOperationSchema,
} from './index.ts'

describe('PortfolioBuyOperationSchema with value preprocessing', () => {
	it('normalizes money-style value strings before coercion', () => {
		const raw: Record<string, unknown> = {
			portfolioOperation: 'buy',
			instrumentTicker: 'VTI',
			value: '2,000',
			currency: 'PLN',
		}
		normalizePortfolioOperationInput(raw)
		const result = parseSafe(PortfolioBuyOperationSchema, raw)
		assert.equal(result.success, true, JSON.stringify(result))
		if (result.success) {
			assert.equal(result.value.value, 2000)
		}
	})
})
