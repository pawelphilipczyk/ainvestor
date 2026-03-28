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

	it('t returns English catalog strings', () => {
		assert.equal(t('app.name'), 'AI Investor')
	})
})
