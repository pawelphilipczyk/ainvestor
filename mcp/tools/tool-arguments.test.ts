import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readStringArgument, readUiLocaleArgument } from './tool-arguments.ts'

describe('readStringArgument', () => {
	it('trims and returns a non-empty string', () => {
		assert.equal(readStringArgument({ ticker: '  VWCE  ' }, 'ticker'), 'VWCE')
	})

	it('returns null when the field is missing', () => {
		assert.equal(readStringArgument({}, 'ticker'), null)
	})

	it('returns null for a whitespace-only string', () => {
		assert.equal(readStringArgument({ ticker: '   ' }, 'ticker'), null)
	})

	it('returns null for a non-string value', () => {
		assert.equal(readStringArgument({ ticker: 0 }, 'ticker'), null)
		assert.equal(readStringArgument({ ticker: true }, 'ticker'), null)
		assert.equal(readStringArgument({ ticker: null }, 'ticker'), null)
	})
})

describe('readUiLocaleArgument', () => {
	it('defaults to DEFAULT_UI_LOCALE when locale is absent', () => {
		assert.equal(readUiLocaleArgument({}), 'en')
	})

	it('defaults to DEFAULT_UI_LOCALE when locale is null', () => {
		assert.equal(readUiLocaleArgument({ locale: null }), 'en')
	})

	it('returns the requested locale when it is supported', () => {
		assert.equal(readUiLocaleArgument({ locale: 'pl' }), 'pl')
	})

	it('throws for an unsupported locale string', () => {
		assert.throws(
			() => readUiLocaleArgument({ locale: 'fr' }),
			/"locale" must be one of: en, pl; got "fr"\./,
		)
	})

	it('throws for a non-string locale value', () => {
		assert.throws(
			() => readUiLocaleArgument({ locale: 3 }),
			/"locale" must be one of: en, pl; got 3\./,
		)
	})
})
