import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sanitizeCatalogLineFragmentForEtfDetailPrompt } from './catalog-etf-openai-sanitize.ts'

describe('sanitizeCatalogLineFragmentForEtfDetailPrompt', () => {
	it('collapses newlines and trims', () => {
		assert.equal(
			sanitizeCatalogLineFragmentForEtfDetailPrompt('  a\nb\tc  '),
			'a b c',
		)
	})

	it('replaces long hyphen and equals runs used as pseudo boundaries', () => {
		assert.equal(
			sanitizeCatalogLineFragmentForEtfDetailPrompt('foo --- bar === baz'),
			'foo — bar — baz',
		)
	})

	it('strips ASCII control characters', () => {
		assert.equal(
			sanitizeCatalogLineFragmentForEtfDetailPrompt('x\u0000y\u007Fz'),
			'xyz',
		)
	})
})
