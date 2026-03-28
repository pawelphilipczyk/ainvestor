import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	LOCALE_DECIMAL_HTML_PATTERN,
	parseLocaleDecimalString,
} from './locale-decimal-input.ts'

describe('parseLocaleDecimalString', () => {
	it('parses integers and decimals with common separators', () => {
		assert.equal(parseLocaleDecimalString('2000'), 2000)
		assert.equal(parseLocaleDecimalString(' 2000 '), 2000)
		assert.equal(parseLocaleDecimalString('2,000'), 2000)
		assert.equal(parseLocaleDecimalString('2000.50'), 2000.5)
		assert.equal(parseLocaleDecimalString('2.000,50'), 2000.5)
	})

	it('returns null for empty or invalid', () => {
		assert.equal(parseLocaleDecimalString(''), null)
		assert.equal(parseLocaleDecimalString('abc'), null)
		assert.equal(parseLocaleDecimalString('-1'), null)
	})
})

describe('LOCALE_DECIMAL_HTML_PATTERN', () => {
	it('matches strings the parser accepts and rejects obvious junk', () => {
		const re = new RegExp(`^(?:${LOCALE_DECIMAL_HTML_PATTERN})$`)
		assert.equal(re.test('2000'), true)
		assert.equal(re.test('2,000.50'), true)
		assert.equal(re.test('abc'), false)
		assert.equal(re.test(''), false)
	})
})
