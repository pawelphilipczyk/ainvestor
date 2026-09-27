import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatValue } from './format.ts'

describe('formatValue', () => {
	it('formats a value using Intl.NumberFormat for a valid currency', () => {
		assert.equal(formatValue(100, 'USD'), '$100.00')
	})

	it('falls back to "value currency" when Intl.NumberFormat rejects the currency code', () => {
		assert.equal(formatValue(100, 'NOTACURRENCY'), '100 NOTACURRENCY')
	})
})
