import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	buildCatalogGistPatch,
	CATALOG_FILENAME,
	catalogMergeKey,
	mergeBankIntoCatalog,
	normalizeCatalogTickerLookupKey,
	parseBankJsonForImport,
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
		assert.equal(result[0].id, 't:OK')
	})

	it('uppercases ticker', () => {
		const result = parseBankJsonToCatalog({
			data: [{ fund_name: 'Test', ticker: 'xmov gr' }],
		})
		assert.equal(result[0].ticker, 'XMOV GR')
		assert.equal(result[0].id, 't:XMOV+GR')
	})

	it('always qualifies ISIN-based id with market or ticker (stable across import batches)', () => {
		const result = parseBankJsonToCatalog({
			data: [
				{
					isin: 'IE00BGV5VR99',
					fund_name: 'Xtrackers',
					ticker: 'XMOV GR',
					assets: 'akcje',
				},
			],
		})
		assert.equal(result.length, 1)
		assert.equal(result[0].id, 'IE00BGV5VR99:GR')
	})

	it('appends market suffix to ISIN when the same ISIN lists on multiple tickers', () => {
		const result = parseBankJsonToCatalog({
			data: [
				{
					isin: 'IE00B4L5Y983',
					fund_name: 'Fund Xetra',
					ticker: '2B7A GR',
					assets: 'akcje',
				},
				{
					isin: 'IE00B4L5Y983',
					fund_name: 'Fund LSE',
					ticker: 'IUUS LN',
					assets: 'akcje',
				},
			],
		})
		assert.equal(result.length, 2)
		const xetra = result.find((e) => e.ticker === '2B7A GR')
		const lse = result.find((e) => e.ticker === 'IUUS LN')
		assert.equal(xetra?.id, 'IE00B4L5Y983:GR')
		assert.equal(lse?.id, 'IE00B4L5Y983:LN')
	})

	it('prefers API market field over ticker suffix when disambiguating', () => {
		const result = parseBankJsonToCatalog({
			data: [
				{
					isin: 'IE00B4L5Y983',
					fund_name: 'A',
					ticker: 'FOO',
					market: 'XETRA',
					assets: 'akcje',
				},
				{
					isin: 'IE00B4L5Y983',
					fund_name: 'B',
					ticker: 'BAR',
					market: 'LSE',
					assets: 'akcje',
				},
			],
		})
		assert.equal(result[0].id, 'IE00B4L5Y983:XETRA')
		assert.equal(result[1].id, 'IE00B4L5Y983:LSE')
	})

	it('import parse keeps first duplicate merge key in paste and skips later row', () => {
		const row = {
			isin: 'IE00BGV5VR99',
			fund_name: 'Xtrackers Future Mobility UCITS ETF 1C',
			ticker: 'XMOV GR',
			description: 'First',
			assets: 'akcje',
			sector: 'technologia',
			id: 'id-a',
		}
		const result = parseBankJsonForImport(
			{
				data: [
					row,
					{
						...row,
						description: 'Second wins',
						id: 'id-b',
					},
				],
			},
			[],
		)
		assert.equal(result.entries.length, 1)
		assert.equal(result.entries[0].description, 'First')
		assert.equal(result.skippedRowDiagnostics.length, 1)
		assert.equal(result.skippedRowDiagnostics[0].index, 2)
	})

	it('merge collapses duplicate keys when two entries share the same merge key', () => {
		const first: Parameters<typeof mergeBankIntoCatalog>[1][number] = {
			id: 'id-a',
			isin: 'IE00BGV5VR99',
			ticker: 'XMOV GR',
			name: 'Xtrackers Future Mobility UCITS ETF 1C',
			type: 'equity',
			description: 'First',
		}
		const second = {
			...first,
			id: 'id-b',
			description: 'Second wins',
		}
		const merged = mergeBankIntoCatalog([], [first, second])
		assert.equal(merged.length, 1)
		assert.equal(merged[0].id, 'id-a')
		assert.equal(merged[0].description, 'Second wins')
	})

	it('parseBankJsonForImport reports rows missing ticker or name', () => {
		const result = parseBankJsonForImport(
			{
				data: [
					{ fund_name: 'No Ticker', ticker: '' },
					{ fund_name: '', ticker: 'TICK' },
					{ fund_name: 'Both', ticker: 'OK' },
				],
			},
			[],
		)
		assert.equal(result.entries.length, 1)
		assert.equal(result.skippedRowDiagnostics.length, 2)
	})

	it('parseBankJsonForImport merges first duplicate in paste and skips later duplicate', () => {
		const row = {
			isin: 'IE00BGV5VR99',
			fund_name: 'Xtrackers',
			ticker: 'XMOV GR',
			assets: 'akcje',
		}
		const result = parseBankJsonForImport({ data: [row, row] }, [])
		assert.equal(result.entries.length, 1)
		assert.equal(result.skippedRowDiagnostics.length, 1)
		assert.equal(result.skippedRowDiagnostics[0].index, 2)
	})
})

describe('normalizeCatalogTickerLookupKey', () => {
	it('collapses spaces to plus and uppercases', () => {
		assert.equal(normalizeCatalogTickerLookupKey('4rue gr'), '4RUE+GR')
		assert.equal(normalizeCatalogTickerLookupKey('4RUE+GR'), '4RUE+GR')
	})
})

describe('catalogMergeKey', () => {
	it('separates same ISIN when ticker differs (multi-market listing)', () => {
		const xetraKey = catalogMergeKey({
			id: '1',
			ticker: '2B7A GR',
			name: '',
			type: 'equity',
			description: '',
			isin: 'IE00B4L5Y983',
		})
		const lseKey = catalogMergeKey({
			id: '2',
			ticker: 'IUUS LN',
			name: '',
			type: 'equity',
			description: '',
			isin: 'IE00B4L5Y983',
		})
		assert.notEqual(xetraKey, lseKey)
		assert.equal(xetraKey, 'i:IE00B4L5Y983|t:2B7A GR')
		assert.equal(lseKey, 'i:IE00B4L5Y983|t:IUUS LN')
	})

	it('matches same ISIN and same normalised ticker', () => {
		const firstKey = catalogMergeKey({
			id: '1',
			ticker: 'XMOV GR',
			name: '',
			type: 'equity',
			description: '',
			isin: 'IE00BGV5VR99',
		})
		const secondKey = catalogMergeKey({
			id: '2',
			ticker: '  xmov gr ',
			name: '',
			type: 'equity',
			description: '',
			isin: 'IE00BGV5VR99',
		})
		assert.equal(firstKey, secondKey)
		assert.equal(firstKey, 'i:IE00BGV5VR99|t:XMOV GR')
	})

	it('uses normalised ticker when ISIN is absent', () => {
		assert.equal(
			catalogMergeKey({
				id: '1',
				ticker: '  vti ',
				name: '',
				type: 'equity',
				description: '',
			}),
			't:VTI',
		)
	})

	it('uses ISIN plus ticker when ISIN is present', () => {
		assert.equal(
			catalogMergeKey({
				id: '1',
				ticker: 'VTI',
				name: '',
				type: 'equity',
				description: '',
				isin: 'US9229087690',
			}),
			'i:US9229087690|t:VTI',
		)
	})
})

describe('mergeBankIntoCatalog', () => {
	it('keeps separate rows for same ISIN when ticker differs (different venues)', () => {
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
		assert.equal(merged.length, 2)
		const xmov = merged.find((entry) => entry.ticker === 'XMOV')
		const xmovGr = merged.find((entry) => entry.ticker === 'XMOV GR')
		assert.ok(xmov)
		assert.ok(xmovGr)
		assert.equal(xmov?.id, 'uuid-1')
		assert.equal(xmov?.name, 'Old Name')
		assert.equal(xmovGr?.name, 'New Name')
		assert.equal(xmovGr?.description, 'Updated')
	})

	it('merges incoming into existing when ISIN and ticker match (refresh same line)', () => {
		const existing = [
			{
				id: 'uuid-1',
				ticker: 'XMOV GR',
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

	it('does not merge ticker-only row with ISIN row (different merge keys)', () => {
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
		assert.equal(merged.length, 2)
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
