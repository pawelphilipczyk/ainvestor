import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatValue } from './format.ts'

describe('formatValue', () => {
	it('formats a valid ISO 4217 currency with two fraction digits', () => {
		assert.equal(formatValue(1234.5, 'USD'), '$1,234.50')
	})

	it('falls back to "value currency" when the currency code is not valid', () => {
		assert.equal(formatValue(100, 'NOTACURRENCY'), '100 NOTACURRENCY')
	})
})
