import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { format, t } from './i18n.ts'

describe('i18n', () => {
	it('format replaces placeholders', () => {
		assert.equal(
			format('Hello {name}, count {n}', { name: 'Ada', n: 2 }),
			'Hello Ada, count 2',
		)
	})

	it('format leaves unknown placeholders when vars are missing', () => {
		assert.equal(format('Hello {name}', {}), 'Hello {name}')
	})

	it('format with empty vars object leaves all placeholders', () => {
		assert.equal(format('count {n}', {}), 'count {n}')
	})

	it('t returns English catalog strings', () => {
		assert.equal(t('app.name'), 'AI Investor')
		assert.equal(t('nav.portfolio'), 'Portfolio')
		assert.equal(t('chrome.signIn'), 'Sign in')
	})
})
