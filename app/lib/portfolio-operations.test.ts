import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CatalogEntry } from '../features/catalog/lib.ts'
import type { EtfEntry } from './gist.ts'
import {
	applyPortfolioOperation,
	normalizePortfolioOperationInput,
	parsePortfolioOperationInput,
} from './portfolio-operations.ts'

function catalogEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
	return {
		id: 'cat-1',
		ticker: 'VTI',
		name: 'Vanguard Total Stock Market',
		type: 'equity',
		description: '',
		...overrides,
	}
}

function holding(overrides: Partial<EtfEntry> = {}): EtfEntry {
	return {
		id: 'h-1',
		name: 'Vanguard Total Stock Market',
		ticker: 'VTI',
		value: 1000,
		currency: 'PLN',
		...overrides,
	}
}

describe('normalizePortfolioOperationInput + PortfolioOperationSchema', () => {
	it('normalizes money-style value strings before coercion', () => {
		const raw: Record<string, unknown> = {
			portfolioOperation: 'buy',
			instrumentTicker: 'VTI',
			value: '2,000',
			currency: 'PLN',
		}
		normalizePortfolioOperationInput(raw)
		const result = parsePortfolioOperationInput(raw)
		assert.equal(result.success, true, JSON.stringify(result))
		if (result.success) {
			assert.equal(result.value.value, 2000)
		}
	})

	it('rejects a sell with a non-positive value', () => {
		const result = parsePortfolioOperationInput({
			portfolioOperation: 'sell',
			instrumentTicker: 'VTI',
			value: '0',
			currency: 'PLN',
		})
		assert.equal(result.success, false)
	})
})

describe('applyPortfolioOperation', () => {
	const catalog = [catalogEntry()]

	it('creates a new row on a buy with no matching holding', () => {
		const outcome = applyPortfolioOperation({
			current: [],
			catalog,
			input: {
				portfolioOperation: 'buy',
				instrumentTicker: 'VTI',
				value: 500,
				currency: 'PLN',
			},
		})
		assert.equal(outcome.applied, true)
		if (outcome.applied) {
			assert.equal(outcome.action, 'created')
			assert.equal(outcome.entry.value, 500)
			assert.equal(outcome.holdings.length, 1)
		}
	})

	it('adds to an existing row on a buy against a matching ticker and currency', () => {
		const outcome = applyPortfolioOperation({
			current: [holding({ value: 1000 })],
			catalog,
			input: {
				portfolioOperation: 'buy',
				instrumentTicker: 'VTI',
				value: 250,
				currency: 'PLN',
			},
		})
		assert.equal(outcome.applied, true)
		if (outcome.applied) {
			assert.equal(outcome.action, 'updated')
			assert.equal(outcome.entry.value, 1250)
			assert.equal(outcome.holdings.length, 1)
		}
	})

	it('does not match a holding of the same ticker in a different currency', () => {
		const outcome = applyPortfolioOperation({
			current: [holding({ value: 1000, currency: 'EUR' })],
			catalog,
			input: {
				portfolioOperation: 'buy',
				instrumentTicker: 'VTI',
				value: 250,
				currency: 'PLN',
			},
		})
		assert.equal(outcome.applied, true)
		if (outcome.applied) {
			assert.equal(outcome.action, 'created')
			assert.equal(outcome.holdings.length, 2)
		}
	})

	it('refuses a buy or sell against a ticker the catalog does not list', () => {
		const outcome = applyPortfolioOperation({
			current: [],
			catalog: [],
			input: {
				portfolioOperation: 'buy',
				instrumentTicker: 'UNKNOWN',
				value: 100,
				currency: 'PLN',
			},
		})
		assert.equal(outcome.applied, false)
		if (!outcome.applied) assert.equal(outcome.blocker, 'catalog_entry_missing')
	})

	it('reduces a matching row on a partial sell', () => {
		const outcome = applyPortfolioOperation({
			current: [holding({ value: 1000 })],
			catalog,
			input: {
				portfolioOperation: 'sell',
				instrumentTicker: 'VTI',
				value: 400,
				currency: 'PLN',
			},
		})
		assert.equal(outcome.applied, true)
		if (outcome.applied) {
			assert.equal(outcome.action, 'updated')
			assert.equal(outcome.entry.value, 600)
		}
	})

	it('removes the row entirely when a sell brings it exactly to zero', () => {
		const outcome = applyPortfolioOperation({
			current: [holding({ value: 400 })],
			catalog,
			input: {
				portfolioOperation: 'sell',
				instrumentTicker: 'VTI',
				value: 400,
				currency: 'PLN',
			},
		})
		assert.equal(outcome.applied, true)
		if (outcome.applied) {
			assert.equal(outcome.action, 'removed')
			assert.equal(outcome.holdings.length, 0)
		}
	})

	it('refuses a sell with no matching holding', () => {
		const outcome = applyPortfolioOperation({
			current: [],
			catalog,
			input: {
				portfolioOperation: 'sell',
				instrumentTicker: 'VTI',
				value: 100,
				currency: 'PLN',
			},
		})
		assert.equal(outcome.applied, false)
		if (!outcome.applied) assert.equal(outcome.blocker, 'sell_no_holding')
	})

	it('refuses a sell that would take a holding below zero', () => {
		const outcome = applyPortfolioOperation({
			current: [holding({ value: 100 })],
			catalog,
			input: {
				portfolioOperation: 'sell',
				instrumentTicker: 'VTI',
				value: 200,
				currency: 'PLN',
			},
		})
		assert.equal(outcome.applied, false)
		if (!outcome.applied) assert.equal(outcome.blocker, 'sell_exceeds_holdings')
	})
})
