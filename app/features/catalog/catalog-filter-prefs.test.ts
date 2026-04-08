import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	CATALOG_FILTER_QUERY_MAX_LENGTH,
	catalogFilterPrefsFromUnknownJson,
	catalogFilterPrefsHaveAnyFilter,
	catalogFilterPrefsToSearchParams,
	normalizedCatalogFilterPrefs,
} from './catalog-filter-prefs.ts'

describe('normalizedCatalogFilterPrefs', () => {
	it('drops unknown type and risk values', () => {
		assert.deepEqual(
			normalizedCatalogFilterPrefs({
				type: 'not-a-type',
				risk: 'extreme',
				query: 'foo',
			}),
			{ type: '', risk: '', query: 'foo' },
		)
	})

	it('accepts known type and risk', () => {
		assert.deepEqual(
			normalizedCatalogFilterPrefs({
				type: 'bond',
				risk: 'low',
				query: '  bar  ',
			}),
			{ type: 'bond', risk: 'low', query: 'bar' },
		)
	})

	it('truncates long query', () => {
		const long = 'x'.repeat(CATALOG_FILTER_QUERY_MAX_LENGTH + 50)
		const prefs = normalizedCatalogFilterPrefs({
			type: '',
			risk: '',
			query: long,
		})
		assert.equal(prefs.query.length, CATALOG_FILTER_QUERY_MAX_LENGTH)
	})
})

describe('catalogFilterPrefsFromUnknownJson', () => {
	it('parses q alias and normalizes', () => {
		const prefs = catalogFilterPrefsFromUnknownJson({
			type: 'equity',
			risk: 'HIGH',
			q: 'x',
		})
		assert.deepEqual(prefs, { type: 'equity', risk: 'high', query: 'x' })
	})

	it('returns null for invalid input', () => {
		assert.equal(catalogFilterPrefsFromUnknownJson(null), null)
		assert.equal(catalogFilterPrefsFromUnknownJson('x'), null)
	})
})

describe('catalogFilterPrefsToSearchParams', () => {
	it('omits empty fields', () => {
		const searchParams = catalogFilterPrefsToSearchParams({
			type: '',
			risk: '',
			query: '',
		})
		assert.equal(searchParams.toString(), '')
	})

	it('serializes non-empty fields', () => {
		const searchParams = catalogFilterPrefsToSearchParams({
			type: 'mixed',
			risk: 'medium',
			query: 'etf',
		})
		assert.equal(searchParams.toString(), 'type=mixed&risk=medium&q=etf')
	})
})

describe('catalogFilterPrefsHaveAnyFilter', () => {
	it('is false when all empty', () => {
		assert.equal(
			catalogFilterPrefsHaveAnyFilter({
				type: '',
				risk: '',
				query: '',
			}),
			false,
		)
	})

	it('is true when any field set', () => {
		assert.equal(
			catalogFilterPrefsHaveAnyFilter({
				type: '',
				risk: 'low',
				query: '',
			}),
			true,
		)
	})
})
