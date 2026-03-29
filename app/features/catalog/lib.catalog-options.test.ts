import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { CatalogEntry } from './lib.ts'
import {
	assetClassSelectOptionsFromCatalog,
	uniqueEtfTypesFromCatalog,
} from './lib.ts'

describe('assetClassSelectOptionsFromCatalog', () => {
	it('returns unique types from catalog in ETF_TYPES order', () => {
		const catalog = [
			{
				id: '1',
				ticker: 'B',
				name: 'Bond fund',
				type: 'bond',
				description: '',
			},
			{
				id: '2',
				ticker: 'E',
				name: 'Eq fund',
				type: 'equity',
				description: '',
			},
			{
				id: '3',
				ticker: 'E2',
				name: 'Eq2',
				type: 'equity',
				description: '',
			},
		] satisfies CatalogEntry[]
		assert.deepEqual(uniqueEtfTypesFromCatalog(catalog), ['equity', 'bond'])
		const selectOptions = assetClassSelectOptionsFromCatalog(catalog)
		assert.deepEqual(
			selectOptions.map((option) => option.value),
			['equity', 'bond'],
		)
		assert.match(selectOptions[0].label, /equity/i)
	})

	it('falls back to all ETF types when catalog is empty', () => {
		const selectOptions = assetClassSelectOptionsFromCatalog([])
		assert.equal(selectOptions.length, 6)
		assert.equal(selectOptions[0].value, 'equity')
	})
})
