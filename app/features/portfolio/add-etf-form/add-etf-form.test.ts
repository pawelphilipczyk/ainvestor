import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSafe } from 'remix/data-schema'
import { normalizePortfolioTradeInput, PortfolioBuySchema } from './index.ts'

describe('PortfolioBuySchema with value preprocessing', () => {
	it('normalizes money-style value strings before coercion', () => {
		const raw: Record<string, unknown> = {
			portfolioAction: 'buy',
			instrumentTicker: 'VTI',
			value: '2,000',
			currency: 'PLN',
		}
		normalizePortfolioTradeInput(raw)
		const result = parseSafe(PortfolioBuySchema, raw)
		assert.equal(result.success, true, JSON.stringify(result))
		if (result.success) {
			assert.equal(result.value.value, 2000)
		}
	})
})
