import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	ETF_INFO_MAX_NAME_LENGTH,
	sanitizeEtfInfoCatalogLine,
	sanitizeEtfInfoFundName,
	sanitizeEtfInfoRequestInputs,
	sanitizeEtfInfoTicker,
} from './advice-etf-info-sanitize.ts'

describe('advice-etf-info-sanitize', () => {
	it('sanitizeEtfInfoFundName strips controls and weakens delimiter runs', () => {
		assert.equal(
			sanitizeEtfInfoFundName('  ACME\n---ignore---\rFund  '),
			'ACME ignore Fund',
		)
		const longName = sanitizeEtfInfoFundName(
			'a'.repeat(ETF_INFO_MAX_NAME_LENGTH + 5),
		)
		assert.ok(longName !== null)
		assert.equal(longName.length, ETF_INFO_MAX_NAME_LENGTH)
		assert.equal(sanitizeEtfInfoFundName('   '), null)
		assert.equal(sanitizeEtfInfoFundName('\n\u0000'), null)
	})

	it('sanitizeEtfInfoTicker keeps A-Z0-9 only and caps length', () => {
		assert.equal(sanitizeEtfInfoTicker('  brk.b  '), 'BRKB')
		assert.equal(sanitizeEtfInfoTicker(''), undefined)
		assert.equal(sanitizeEtfInfoTicker('   '), undefined)
	})

	it('sanitizeEtfInfoCatalogLine replaces long dash runs and caps length', () => {
		const line = sanitizeEtfInfoCatalogLine('A\n---\nB')
		assert.ok(!line.includes('---'))
		assert.match(line, /—/)
	})

	it('sanitizeEtfInfoRequestInputs returns null when name is invalid', () => {
		assert.equal(
			sanitizeEtfInfoRequestInputs({ name: '   ', ticker: 'X' }),
			null,
		)
	})
})
