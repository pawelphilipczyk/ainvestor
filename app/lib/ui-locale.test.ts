import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { format, t } from './i18n.ts'
import { localeQueryToUiLocale, runWithUiCopyContext } from './ui-locale.ts'

describe('ui locale', () => {
	it('localeQueryToUiLocale parses supported tags', () => {
		assert.equal(localeQueryToUiLocale(null), null)
		assert.equal(localeQueryToUiLocale(''), 'en')
		assert.equal(localeQueryToUiLocale(' en '), 'en')
		assert.equal(localeQueryToUiLocale('PL'), 'pl')
		assert.equal(localeQueryToUiLocale('xx'), 'invalid')
	})

	it('t() and format() use Polish copy inside runWithUiCopyContext', () => {
		runWithUiCopyContext({ locale: 'pl', shellReturnPath: '/catalog' }, () => {
			assert.equal(t('catalog.table.name'), 'Nazwa')
			assert.equal(
				format(t('guidelines.list.deleteAria.instrument'), { name: 'VWCE' }),
				'Usuń wytyczną dla VWCE',
			)
		})
	})
})
