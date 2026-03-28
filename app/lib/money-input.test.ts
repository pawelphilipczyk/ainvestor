import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	MONEY_AMOUNT_HTML_PATTERN,
	parseMoneyAmountString,
} from './money-input.ts'

describe('parseMoneyAmountString', () => {
	it('parses integers and decimals with common separators', () => {
		assert.equal(parseMoneyAmountString('2000'), 2000)
		assert.equal(parseMoneyAmountString(' 2000 '), 2000)
		assert.equal(parseMoneyAmountString('2,000'), 2000)
		assert.equal(parseMoneyAmountString('2000.50'), 2000.5)
		assert.equal(parseMoneyAmountString('2.000,50'), 2000.5)
	})

	it('returns null for empty or invalid', () => {
		assert.equal(parseMoneyAmountString(''), null)
		assert.equal(parseMoneyAmountString('abc'), null)
		assert.equal(parseMoneyAmountString('-1'), null)
	})
})

describe('MONEY_AMOUNT_HTML_PATTERN', () => {
	it('matches strings the parser accepts and rejects obvious junk', () => {
		const re = new RegExp(`^(?:${MONEY_AMOUNT_HTML_PATTERN})$`)
		assert.equal(re.test('2000'), true)
		assert.equal(re.test('2,000.50'), true)
		assert.equal(re.test('abc'), false)
		assert.equal(re.test(''), false)
	})
})
