import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
	buildCatalogGistPatch,
	CATALOG_FILENAME,
	catalogMergeKey,
	deriveEtfTypeFromBank,
	fetchCatalogSourceRows,
	fetchSharedCatalogSnapshot,
	mergeBankIntoCatalog,
	normalizeCatalogTickerLookupKey,
	parseBankJsonForImport,
	parseBankJsonToCatalog,
	parseCatalogFromGist,
	parseCatalogRiskFilterParam,
	resetSharedCatalogForTests,
	riskBandFromRiskKid,
	saveCatalog,
	setSharedCatalogForTests,
} from './lib.ts'

describe('riskBandFromRiskKid', () => {
	it('maps risk_kid scores to low, medium, and high bands', () => {
		assert.equal(riskBandFromRiskKid(1), 'low')
		assert.equal(riskBandFromRiskKid(2), 'low')
		assert.equal(riskBandFromRiskKid(3), 'medium')
		assert.equal(riskBandFromRiskKid(4), 'medium')
		assert.equal(riskBandFromRiskKid(5), 'high')
		assert.equal(riskBandFromRiskKid(6), 'high')
		assert.equal(riskBandFromRiskKid(7), 'high')
	})

	it('returns undefined for missing, non-integer, or out-of-range scores', () => {
		assert.equal(riskBandFromRiskKid(undefined), undefined)
		assert.equal(riskBandFromRiskKid(2.5), undefined)
		assert.equal(riskBandFromRiskKid(0), undefined)
		assert.equal(riskBandFromRiskKid(8), undefined)
	})
})

describe('parseCatalogRiskFilterParam', () => {
	it('accepts known bands case-insensitively', () => {
		assert.equal(parseCatalogRiskFilterParam('low'), 'low')
		assert.equal(parseCatalogRiskFilterParam('MEDIUM'), 'medium')
		assert.equal(parseCatalogRiskFilterParam(' High '), 'high')
	})

	it('returns empty string for null, empty, or unknown values', () => {
		assert.equal(parseCatalogRiskFilterParam(null), '')
		assert.equal(parseCatalogRiskFilterParam(''), '')
		assert.equal(parseCatalogRiskFilterParam('  '), '')
		assert.equal(parseCatalogRiskFilterParam('extreme'), '')
	})
})

describe('fetchSharedCatalogSnapshot ttl cache', () => {
	const originalFetch = globalThis.fetch
	const originalGistId = process.env.SHARED_CATALOG_GIST_ID
	const originalTtl = process.env.SHARED_CATALOG_CACHE_TTL_MS

	afterEach(() => {
		globalThis.fetch = originalFetch
		resetSharedCatalogForTests()
		if (originalGistId === undefined) {
			delete process.env.SHARED_CATALOG_GIST_ID
		} else {
			process.env.SHARED_CATALOG_GIST_ID = originalGistId
		}
		if (originalTtl === undefined) {
			delete process.env.SHARED_CATALOG_CACHE_TTL_MS
		} else {
			process.env.SHARED_CATALOG_CACHE_TTL_MS = originalTtl
		}
	})

	it('hits GitHub once and returns independent clones while the cache entry is valid', async () => {
		let fetchCount = 0
		globalThis.fetch = async (input: string | URL | Request) => {
			fetchCount += 1
			assert.match(String(input), /\/gists\/ttl-gist-test$/)
			return new Response(
				JSON.stringify({
					files: {
						[CATALOG_FILENAME]: {
							content: JSON.stringify([
								{
									id: '1',
									ticker: 'ABC',
									name: 'Alpha',
									type: 'equity',
									description: '',
								},
							]),
						},
					},
					owner: { login: 'owner' },
				}),
				{ status: 200 },
			)
		}
		process.env.SHARED_CATALOG_GIST_ID = 'ttl-gist-test'
		process.env.SHARED_CATALOG_CACHE_TTL_MS = '60000'

		const first = await fetchSharedCatalogSnapshot()
		const second = await fetchSharedCatalogSnapshot()
		assert.equal(fetchCount, 1)
		assert.equal(first.entries.length, 1)
		assert.equal(second.entries.length, 1)
		assert.equal(first.entries[0]?.ticker, 'ABC')
		if (first.entries[0]) {
			first.entries[0] = { ...first.entries[0], ticker: 'MUT' }
		}
		assert.equal(second.entries[0]?.ticker, 'ABC')
	})

	it('downloads catalog.json from raw_url when the gist API truncated it', async () => {
		const fullCatalog = JSON.stringify([
			{
				id: '1',
				ticker: 'ABC',
				name: 'Alpha',
				type: 'equity',
				description: '',
			},
		])
		const requested: string[] = []
		globalThis.fetch = async (input: string | URL | Request) => {
			const url = String(input)
			requested.push(url)
			if (url === 'https://gist.example/raw/catalog.json') {
				return new Response(fullCatalog, { status: 200 })
			}
			return new Response(
				JSON.stringify({
					files: {
						[CATALOG_FILENAME]: {
							content: fullCatalog.slice(0, 20),
							truncated: true,
							raw_url: 'https://gist.example/raw/catalog.json',
						},
					},
					owner: { login: 'owner' },
				}),
				{ status: 200 },
			)
		}
		process.env.SHARED_CATALOG_GIST_ID = 'gist-truncated'
		process.env.SHARED_CATALOG_CACHE_TTL_MS = '0'

		const snapshot = await fetchSharedCatalogSnapshot()
		assert.equal(snapshot.entries[0]?.ticker, 'ABC')
		assert.equal(snapshot.ownerLogin, 'owner')
		assert.equal(requested.length, 2)
	})

	it('does not cache when ttl is 0', async () => {
		let fetchCount = 0
		globalThis.fetch = async () => {
			fetchCount += 1
			return new Response(
				JSON.stringify({
					files: { [CATALOG_FILENAME]: { content: '[]' } },
					owner: { login: 'o' },
				}),
				{ status: 200 },
			)
		}
		process.env.SHARED_CATALOG_GIST_ID = 'gist-no-ttl'
		process.env.SHARED_CATALOG_CACHE_TTL_MS = '0'

		await fetchSharedCatalogSnapshot()
		await fetchSharedCatalogSnapshot()
		assert.equal(fetchCount, 2)
	})

	it('saveCatalog invalidates the cached snapshot so the next read is fresh', async () => {
		let getCount = 0
		let served = 'ABC'
		globalThis.fetch = async (
			input: string | URL | Request,
			init?: RequestInit,
		) => {
			if (init?.method === 'PATCH') {
				const body = JSON.parse(String(init.body)) as {
					files: Record<string, { content: string }>
				}
				const patched = JSON.parse(
					body.files[CATALOG_FILENAME]?.content ?? '[]',
				) as { ticker: string }[]
				served = patched[0]?.ticker ?? served
				return new Response('{}', { status: 200 })
			}
			getCount += 1
			assert.match(String(input), /\/gists\/ttl-gist-save$/)
			return new Response(
				JSON.stringify({
					files: {
						[CATALOG_FILENAME]: {
							content: JSON.stringify([
								{
									id: '1',
									ticker: served,
									name: 'Alpha',
									type: 'equity',
									description: '',
								},
							]),
						},
					},
					owner: { login: 'owner' },
				}),
				{ status: 200 },
			)
		}
		process.env.SHARED_CATALOG_GIST_ID = 'ttl-gist-save'
		process.env.SHARED_CATALOG_CACHE_TTL_MS = '60000'

		const before = await fetchSharedCatalogSnapshot()
		assert.equal(before.entries[0]?.ticker, 'ABC')
		assert.equal(getCount, 1)

		await saveCatalog({
			token: 'tkn',
			entries: [
				{
					id: '1',
					ticker: 'XYZ',
					name: 'Alpha',
					type: 'equity',
					description: '',
				},
			],
		})

		const after = await fetchSharedCatalogSnapshot()
		assert.equal(getCount, 2)
		assert.equal(after.entries[0]?.ticker, 'XYZ')
	})
})

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

	it('parseBankJsonForImport rejects an invalid ISIN even though ticker and name are fine', () => {
		const result = parseBankJsonForImport(
			{
				data: [{ fund_name: 'Bad ISIN', ticker: 'BAD', isin: 'not-an-isin' }],
			},
			[],
		)
		assert.equal(result.entries.length, 0)
		assert.equal(result.skippedRowDiagnostics.length, 1)
		assert.deepEqual(result.skippedRowDiagnostics[0].issues, [
			{ kind: 'isinInvalid' },
		])
	})

	it('parseBankJsonForImport rejects a risk_kid outside 1-7', () => {
		const result = parseBankJsonForImport(
			{
				data: [
					{ fund_name: 'Bad Risk', ticker: 'RISK', risk_kid: 9 },
					{ fund_name: 'Good Risk', ticker: 'OK', risk_kid: 4 },
				],
			},
			[],
		)
		assert.equal(result.entries.length, 1)
		assert.equal(result.entries[0].ticker, 'OK')
		assert.equal(result.skippedRowDiagnostics.length, 1)
		assert.deepEqual(result.skippedRowDiagnostics[0].issues, [
			{ kind: 'riskKidOutOfRange' },
		])
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

describe('deriveEtfTypeFromBank', () => {
	it('reads what a fund is from assets, not what it invests in from sector', () => {
		// SGLN LN — physical gold ETC.
		assert.equal(
			deriveEtfTypeFromBank({ assets: 'surowce', sector: 'metale' }),
			'commodity',
		)
		// IS0E GR / GDX LN — gold-miner equity funds.
		assert.equal(
			deriveEtfTypeFromBank({ assets: 'akcje', sector: 'surowce i towary' }),
			'equity',
		)
		assert.equal(
			deriveEtfTypeFromBank({ assets: 'surowce', sector: 'produkty rolne' }),
			'commodity',
		)
	})

	it('narrows equity to real estate and bonds to money market by sector', () => {
		assert.equal(
			deriveEtfTypeFromBank({ assets: 'akcje', sector: 'nieruchomości' }),
			'real_estate',
		)
		// L8I3 GR — EUR overnight return.
		assert.equal(
			deriveEtfTypeFromBank({ assets: 'obligacje', sector: 'rynek pieniężny' }),
			'money_market',
		)
		assert.equal(
			deriveEtfTypeFromBank({
				assets: 'obligacje',
				sector: 'obligacje skarbowe',
			}),
			'bond',
		)
		assert.equal(
			deriveEtfTypeFromBank({ assets: 'mieszany', sector: '' }),
			'mixed',
		)
	})

	it('returns unknown instead of guessing when assets names no class', () => {
		assert.equal(
			deriveEtfTypeFromBank({ assets: null, sector: null }),
			'unknown',
		)
		assert.equal(deriveEtfTypeFromBank({ assets: '', sector: '' }), 'unknown')
		assert.equal(
			deriveEtfTypeFromBank({ assets: 'kryptowaluty', sector: null }),
			'unknown',
		)
		// A commodity-sounding sector alone does not decide the class.
		assert.equal(
			deriveEtfTypeFromBank({ assets: undefined, sector: 'metale' }),
			'unknown',
		)
	})
})

describe('parseBankJsonForImport keeps the bank fields and reports types', () => {
	const goldRow = {
		isin: 'IE00B4ND3602',
		fund_name: 'iShares Physical Gold ETC',
		ticker: 'SGLN LN',
		id: 'IE00B4ND3602_SGLN.LN',
		assets: 'surowce',
		sector: 'metale',
		market: 'GBR-LSE',
		currency: 'USD',
		fund_currency: 'USD',
		replication: null,
		country: 'Irlandia',
		investment_subject: null,
		tags: [{ tag: 'złoto' }, { tag: 'surowce' }],
		price: 71.3,
	}

	it('persists assets and the other stable bank fields on the entry', () => {
		const { entries } = parseBankJsonForImport({ data: [goldRow] }, [])
		const entry = entries[0]
		assert.equal(entry?.type, 'commodity')
		assert.equal(entry?.assets, 'surowce')
		assert.equal(entry?.market, 'GBR-LSE')
		assert.equal(entry?.country, 'Irlandia')
		assert.deepEqual(entry?.tags, ['złoto', 'surowce'])
		assert.equal(entry?.replication, undefined)
		assert.equal(entry?.investment_subject, undefined)
	})

	it('keeps the raw row, keyed by the id the merged catalog will carry', () => {
		const existing = {
			id: 'legacy-id',
			isin: 'IE00B4ND3602',
			ticker: 'SGLN LN',
			name: 'Gold',
			type: 'equity' as const,
			description: '',
		}
		const result = parseBankJsonForImport({ data: [goldRow] }, [existing])
		assert.deepEqual(Object.keys(result.sourceRowsById), ['legacy-id'])
		assert.deepEqual(result.sourceRowsById['legacy-id'], goldRow)
		assert.deepEqual(result.typeChanges, [
			{
				label: 'SGLN LN — iShares Physical Gold ETC',
				from: 'equity',
				to: 'commodity',
			},
		])
	})

	it('keeps a hand-set type when the bank still names no class', () => {
		const existing = {
			id: 'IE00B4ND3602_SGLN.LN',
			isin: 'IE00B4ND3602',
			ticker: 'SGLN LN',
			name: 'Gold',
			type: 'commodity' as const,
			description: '',
		}
		const result = parseBankJsonForImport(
			{ data: [{ ...goldRow, assets: null }] },
			[existing],
		)
		assert.equal(result.entries[0]?.type, 'commodity')
		assert.deepEqual(result.unclassifiedRows, [])
		assert.deepEqual(result.typeChanges, [])
	})

	it('clears bank fields a re-import no longer sends', () => {
		const [first] = parseBankJsonForImport({ data: [goldRow] }, []).entries
		assert.ok(first)
		const withHandNote = { ...first, type: 'commodity' as const }
		const reimport = parseBankJsonForImport(
			{ data: [{ ...goldRow, assets: null, tags: [], market: '' }] },
			[withHandNote],
		)
		const [merged] = mergeBankIntoCatalog([withHandNote], reimport.entries)
		assert.equal(merged?.assets, undefined)
		assert.equal(merged?.tags, undefined)
		assert.equal(merged?.market, undefined)
		assert.equal(merged?.country, 'Irlandia')
		assert.equal(merged?.type, 'commodity')
		assert.equal(merged?.id, first.id)
	})

	it('lists rows it could not classify', () => {
		const result = parseBankJsonForImport(
			{
				data: [
					goldRow,
					{
						fund_name: 'Bitcoin FIZ',
						ticker: 'ETFBTCPL',
						assets: 'kryptowaluty',
					},
				],
			},
			[],
		)
		assert.equal(result.entries[1]?.type, 'unknown')
		assert.deepEqual(result.unclassifiedRows, [
			{ index: 2, label: 'ETFBTCPL — Bitcoin FIZ' },
		])
		assert.deepEqual(result.typeChanges, [])
	})

	it('saveCatalog stores source rows alongside the catalog', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: 'owner' })
		try {
			assert.deepEqual(await fetchCatalogSourceRows(), {})
			await saveCatalog({
				token: 'tkn',
				entries: [],
				sourceRowsById: { a: { ticker: 'A' } },
			})
			assert.deepEqual(await fetchCatalogSourceRows(), { a: { ticker: 'A' } })
			await saveCatalog({ token: 'tkn', entries: [] })
			assert.deepEqual(await fetchCatalogSourceRows(), { a: { ticker: 'A' } })
		} finally {
			resetSharedCatalogForTests()
		}
	})
})
