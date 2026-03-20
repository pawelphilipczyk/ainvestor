import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	buildCatalogGistPatch,
	CATALOG_FILENAME,
	mergeBankIntoCatalog,
	parseBankJsonToCatalog,
	parseCatalogFromGist,
} from './lib.ts'

describe('parseCatalogFromGist', () => {
	it('returns empty array when catalog file is absent', () => {
		const gist = { files: {} }
		assert.deepEqual(parseCatalogFromGist(gist), [])
	})

	it('returns empty array when file content is null', () => {
		const gist = { files: { [CATALOG_FILENAME]: { content: null } } }
		assert.deepEqual(parseCatalogFromGist(gist), [])
	})

	it('returns empty array when content is invalid JSON', () => {
		const gist = { files: { [CATALOG_FILENAME]: { content: 'not json' } } }
		assert.deepEqual(parseCatalogFromGist(gist), [])
	})

	it('returns entries from valid JSON content', () => {
		const entry = {
			id: '1',
			ticker: 'VTI',
			name: 'Vanguard Total',
			type: 'equity',
			description: '',
		}
		const gist = {
			files: {
				[CATALOG_FILENAME]: { content: JSON.stringify([entry]) },
			},
		}
		const result = parseCatalogFromGist(gist)
		assert.equal(result.length, 1)
		assert.equal(result[0].ticker, 'VTI')
	})
})

describe('buildCatalogGistPatch', () => {
	it('wraps entries in the expected gist patch shape', () => {
		const entry = {
			id: '1',
			ticker: 'VTI',
			name: 'Vanguard',
			type: 'equity' as const,
			description: '',
		}
		const patch = buildCatalogGistPatch([entry])
		assert.ok(patch.files[CATALOG_FILENAME])
		const parsed = JSON.parse(patch.files[CATALOG_FILENAME].content)
		assert.equal(parsed[0].ticker, 'VTI')
	})
})

describe('parseBankJsonToCatalog', () => {
	it('returns empty array for non-object input', () => {
		assert.deepEqual(parseBankJsonToCatalog(null), [])
		assert.deepEqual(parseBankJsonToCatalog(''), [])
		assert.deepEqual(parseBankJsonToCatalog([]), [])
	})

	it('returns empty array when data is not an array', () => {
		assert.deepEqual(parseBankJsonToCatalog({ data: null }), [])
		assert.deepEqual(parseBankJsonToCatalog({}), [])
	})

	it('parses bank API response format', () => {
		const json = {
			data: [
				{
					isin: 'IE00BGV5VR99',
					fund_name: 'Xtrackers Future Mobility UCITS ETF 1C',
					expense_ratio: '0,35%',
					ticker: 'XMOV GR',
					description: 'ETF tracks Nasdaq Future Mobility.',
					assets: 'akcje',
					sector: 'technologia',
					region: 'Świat',
					risk_kid: 4,
					rate_of_return: 15.82,
					volatility: '19,16%',
					return_risk: '1,63',
					fund_size: '166 mln USD',
					esg: 'tak',
					id: 'IE00BGV5VR99_XMOV.GR',
				},
			],
			count: 612,
			total_count: 612,
		}
		const result = parseBankJsonToCatalog(json)
		assert.equal(result.length, 1)
		assert.equal(result[0].id, 'IE00BGV5VR99_XMOV.GR')
		assert.equal(result[0].ticker, 'XMOV GR')
		assert.equal(result[0].name, 'Xtrackers Future Mobility UCITS ETF 1C')
		assert.equal(result[0].type, 'equity')
		assert.equal(result[0].description, 'ETF tracks Nasdaq Future Mobility.')
		assert.equal(result[0].isin, 'IE00BGV5VR99')
		assert.equal(result[0].expense_ratio, '0,35%')
		assert.equal(result[0].risk_kid, 4)
		assert.equal(result[0].region, 'Świat')
		assert.equal(result[0].sector, 'technologia')
		assert.equal(result[0].rate_of_return, 15.82)
		assert.equal(result[0].volatility, '19,16%')
		assert.equal(result[0].return_risk, '1,63')
		assert.equal(result[0].fund_size, '166 mln USD')
		assert.equal(result[0].esg, true)
	})

	it('maps assets to EtfType', () => {
		const bond = parseBankJsonToCatalog({
			data: [{ fund_name: 'Bond ETF', ticker: 'BND', assets: 'obligacje' }],
		})
		assert.equal(bond[0].type, 'bond')

		const mixed = parseBankJsonToCatalog({
			data: [{ fund_name: 'Mixed', ticker: 'MIX', assets: 'mieszany' }],
		})
		assert.equal(mixed[0].type, 'mixed')

		const reit = parseBankJsonToCatalog({
			data: [
				{
					fund_name: 'REIT',
					ticker: 'REIT',
					assets: 'akcje',
					sector: 'nieruchomości',
				},
			],
		})
		assert.equal(reit[0].type, 'real_estate')
	})

	it('skips items missing ticker or fund_name', () => {
		const result = parseBankJsonToCatalog({
			data: [
				{ fund_name: 'No Ticker', ticker: '' },
				{ fund_name: '', ticker: 'TICK' },
				{ fund_name: 'Both', ticker: 'OK' },
			],
		})
		assert.equal(result.length, 1)
		assert.equal(result[0].ticker, 'OK')
	})

	it('uppercases ticker', () => {
		const result = parseBankJsonToCatalog({
			data: [{ fund_name: 'Test', ticker: 'xmov gr' }],
		})
		assert.equal(result[0].ticker, 'XMOV GR')
	})

	it('dedupes duplicate rows in the same paste (same ISIN)', () => {
		const row = {
			isin: 'IE00BGV5VR99',
			fund_name: 'Xtrackers Future Mobility UCITS ETF 1C',
			ticker: 'XMOV GR',
			description: 'First',
			assets: 'akcje',
			sector: 'technologia',
			id: 'id-a',
		}
		const result = parseBankJsonToCatalog({
			data: [
				row,
				{
					...row,
					description: 'Second wins',
					id: 'id-b',
				},
			],
		})
		assert.equal(result.length, 1)
		assert.equal(result[0].id, 'id-a')
		assert.equal(result[0].description, 'Second wins')
	})
})

describe('mergeBankIntoCatalog', () => {
	it('merges incoming into existing by ISIN (same fund, different ticker formatting)', () => {
		const existing = [
			{
				id: 'uuid-1',
				ticker: 'XMOV',
				name: 'Old Name',
				type: 'equity' as const,
				description: '',
				isin: 'IE00BGV5VR99',
			},
		]
		const incoming = [
			{
				id: 'IE00BGV5VR99_XMOV.GR',
				ticker: 'XMOV GR',
				name: 'New Name',
				type: 'equity' as const,
				description: 'Updated',
				isin: 'IE00BGV5VR99',
			},
		]
		const merged = mergeBankIntoCatalog(existing, incoming)
		assert.equal(merged.length, 1)
		assert.equal(merged[0].id, 'uuid-1')
		assert.equal(merged[0].name, 'New Name')
		assert.equal(merged[0].ticker, 'XMOV GR')
		assert.equal(merged[0].description, 'Updated')
	})

	it('merges ticker-only row into existing ISIN row when pasting an update', () => {
		const existing = [
			{
				id: 'keep-me',
				ticker: 'VTI',
				name: 'Vanguard Total Stock',
				type: 'equity' as const,
				description: '',
				isin: 'US9229087690',
			},
		]
		const incoming = [
			{
				id: 'bank-row',
				ticker: 'VTI',
				name: 'Vanguard Total Stock Market ETF',
				type: 'equity' as const,
				description: 'Broader desc',
			},
		]
		const merged = mergeBankIntoCatalog(existing, incoming)
		assert.equal(merged.length, 1)
		assert.equal(merged[0].id, 'keep-me')
		assert.equal(merged[0].isin, 'US9229087690')
		assert.equal(merged[0].name, 'Vanguard Total Stock Market ETF')
	})

	it('appends new entries', () => {
		const existing = [
			{
				id: '1',
				ticker: 'A',
				name: 'A',
				type: 'equity' as const,
				description: '',
				isin: 'X',
			},
		]
		const incoming = [
			{
				id: '2',
				ticker: 'B',
				name: 'B',
				type: 'equity' as const,
				description: '',
				isin: 'Y',
			},
		]
		const merged = mergeBankIntoCatalog(existing, incoming)
		assert.equal(merged.length, 2)
	})
})
