import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSafe } from 'remix/data-schema'
import { normalizePortfolioTradeInput, PortfolioBuySchema } from './index.ts'

describe('PortfolioBuySchema with optional field preprocessing', () => {
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

	it('accepts empty quantity when normalized to absent', () => {
		const raw: Record<string, unknown> = {
			portfolioAction: 'buy',
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'PLN',
			quantity: '',
		}
		normalizePortfolioTradeInput(raw)

		const result = parseSafe(PortfolioBuySchema, raw)
		assert.equal(result.success, true, JSON.stringify(result))
		if (result.success) {
			assert.equal(result.value.quantity, undefined)
		}
	})

	it('rejects decimal quantity after locale normalization', () => {
		const raw: Record<string, unknown> = {
			portfolioAction: 'buy',
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'PLN',
			quantity: '1,5',
		}
		normalizePortfolioTradeInput(raw)
		const result = parseSafe(PortfolioBuySchema, raw)
		assert.equal(result.success, false)
	})

	it('parses quantity with thousands separator without corrupting decimals', () => {
		const raw: Record<string, unknown> = {
			portfolioAction: 'buy',
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'PLN',
			quantity: '2,000',
		}
		normalizePortfolioTradeInput(raw)
		const result = parseSafe(PortfolioBuySchema, raw)
		assert.equal(result.success, true, JSON.stringify(result))
		if (result.success) {
			assert.equal(result.value.quantity, 2000)
		}
	})
})
