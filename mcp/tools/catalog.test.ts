import * as assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import type { CatalogEntry } from '../../app/features/catalog/lib.ts'
import {
	fetchCatalog,
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../../app/features/catalog/lib.ts'
import { resetApprovedCallerCache } from '../approved-caller.ts'
import type { GistCredentials } from '../data-gist.ts'
import {
	createDeleteCatalogEntryTool,
	createGetCatalogEntryTool,
	createListCatalogTool,
	createUpsertCatalogEntryTool,
	summarizeCatalogSearch,
} from './catalog.ts'
import { createImportCatalogFromBankFileTool } from './catalog-import.ts'

const OWNER = 'catalog-owner'

const credentials: GistCredentials = {
	githubToken: 'owner-token',
	dataGistId: 'pinned-gist',
}

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
	return {
		id: 't:VWCE',
		ticker: 'VWCE',
		name: 'Vanguard FTSE All-World',
		type: 'equity',
		description: 'Akcje globalne',
		...overrides,
	}
}

const CATALOG = [
	entry(),
	entry({
		id: 't:AGGH',
		ticker: 'AGGH',
		name: 'iShares Core Global Aggregate Bond',
		type: 'bond',
		description: 'Obligacje światowe',
		expense_ratio: '0,10%',
		risk_kid: 2,
	}),
	entry({
		id: 't:IPRP',
		ticker: 'IPRP',
		name: 'iShares European Property',
		type: 'real_estate',
		description: 'Nieruchomości w Europie',
	}),
]

/** Seed the shared catalog and answer the caller-login lookup as `login`. */
function stubCatalog(
	params: { login?: string; entries?: CatalogEntry[] } = {},
) {
	setSharedCatalogForTests({
		entries: params.entries ?? CATALOG,
		ownerLogin: OWNER,
	})
	globalThis.fetch = async () => Response.json({ login: params.login ?? OWNER })
}

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	resetSharedCatalogForTests()
	resetApprovedCallerCache()
})

function payloadOf(result: { content: { text: string }[] }) {
	return JSON.parse(result.content[0].text) as Record<string, never> & {
		[key: string]: unknown
	}
}

describe('summarizeCatalogSearch', () => {
	it('never lets a truncated list read as the whole catalog', () => {
		const summary = summarizeCatalogSearch({
			catalog: CATALOG,
			query: '',
			limit: 2,
		})
		assert.equal(summary.catalogSize, 3)
		assert.equal(summary.matched, 3)
		assert.equal(summary.returned, 2)
		assert.equal(summary.truncated, true)
		assert.match(String(summary.note), /Showing 2 of 3 matches/)
	})

	it('matches ticker, name and description, case-insensitively', () => {
		const byTicker = summarizeCatalogSearch({
			catalog: CATALOG,
			query: 'aggh',
			limit: 10,
		})
		assert.deepEqual(
			byTicker.entries.map((row) => row.ticker),
			['AGGH'],
		)
		const byDescription = summarizeCatalogSearch({
			catalog: CATALOG,
			query: 'Nieruchomości',
			limit: 10,
		})
		assert.deepEqual(
			byDescription.entries.map((row) => row.ticker),
			['IPRP'],
		)
	})

	it('returns a compact projection, not the whole record', () => {
		const summary = summarizeCatalogSearch({
			catalog: CATALOG,
			query: 'AGGH',
			limit: 10,
		})
		assert.deepEqual(Object.keys(summary.entries[0]).sort(), [
			'expense_ratio',
			'id',
			'name',
			'risk_kid',
			'ticker',
			'type',
		])
	})
})

describe('list_catalog tool', () => {
	it('caps the limit so a huge catalog cannot flood the context', async () => {
		stubCatalog()
		const payload = payloadOf(
			await createListCatalogTool().handler({ limit: 5000 }),
		)
		assert.equal(payload.returned, 3)
		assert.match(
			createListCatalogTool().description,
			/only source of valid tickers/,
		)
	})

	it('warns that formatted fields are not numbers', async () => {
		assert.match(createListCatalogTool().description, /display strings/)
		assert.match(createGetCatalogEntryTool().description, /display strings/)
	})

	it('rejects a limit that is not a positive number', async () => {
		stubCatalog()
		await assert.rejects(
			async () => createListCatalogTool().handler({ limit: 0 }),
			/"limit" must be a positive number/,
		)
	})
})

describe('get_catalog_entry tool', () => {
	it('finds an entry by ticker regardless of case, and by id', async () => {
		stubCatalog()
		const tool = createGetCatalogEntryTool()
		const byTicker = payloadOf(await tool.handler({ ticker: 'vwce' }))
		assert.equal(byTicker.id, 't:VWCE')
		const byId = payloadOf(await tool.handler({ id: 't:AGGH' }))
		assert.equal(byId.ticker, 'AGGH')
		// The full record, unlike the search projection.
		assert.equal(byId.description, 'Obligacje światowe')
	})

	it('asks for one of the two identifiers, and reports an unknown one', async () => {
		stubCatalog()
		const tool = createGetCatalogEntryTool()
		await assert.rejects(
			async () => tool.handler({}),
			/Pass either "ticker" or "id"/,
		)
		await assert.rejects(
			async () => tool.handler({ ticker: 'NOPE' }),
			/No catalog entry matches ticker "NOPE".*list_catalog/s,
		)
	})
})

describe('catalog writes', () => {
	it('refuses a caller who does not own the shared gist, naming both accounts', async () => {
		stubCatalog({ login: 'someone-else' })
		await assert.rejects(
			async () =>
				createUpsertCatalogEntryTool(credentials).handler({
					ticker: 'VWCE',
					expense_ratio: '0,22%',
				}),
			/belongs to catalog-owner, and this token belongs to someone-else/,
		)
		// Nothing was written.
		const catalog = await fetchCatalog()
		assert.equal(
			catalog.find((row) => row.ticker === 'VWCE')?.expense_ratio,
			undefined,
		)
	})

	it('refuses when GitHub will not resolve the token to an account', async () => {
		setSharedCatalogForTests({ entries: CATALOG, ownerLogin: OWNER })
		globalThis.fetch = async () => new Response(null, { status: 401 })
		await assert.rejects(
			async () =>
				createDeleteCatalogEntryTool(credentials).handler({ ticker: 'VWCE' }),
			/would not resolve this token to an account/,
		)
	})

	it('updates only the named fields of an existing fund, keeping its id', async () => {
		stubCatalog()
		const payload = payloadOf(
			await createUpsertCatalogEntryTool(credentials).handler({
				ticker: 'aggh',
				expense_ratio: '0,12%',
			}),
		)

		assert.equal(payload.action, 'updated')
		const saved = (await fetchCatalog()).find((row) => row.ticker === 'AGGH')
		assert.equal(saved?.id, 't:AGGH')
		assert.equal(saved?.expense_ratio, '0,12%')
		// Untouched fields survive the partial update.
		assert.equal(saved?.name, 'iShares Core Global Aggregate Bond')
		assert.equal(saved?.risk_kid, 2)
		assert.equal(saved?.description, 'Obligacje światowe')
	})

	it('updates a fund that has an ISIN without re-passing it, and without duplicating the row', async () => {
		// Regression test: mergeBankIntoCatalog matches rows by an ISIN-qualified
		// key, so building the changed row without carrying the existing isin
		// forward used to fail to match the existing row and append a second one
		// under the same id instead of updating it.
		stubCatalog({
			entries: [
				entry({
					id: 'IE00B5BMR087:SXR8',
					ticker: 'SXR8',
					name: 'iShares Core S&P 500',
					isin: 'IE00B5BMR087',
				}),
			],
		})
		const payload = payloadOf(
			await createUpsertCatalogEntryTool(credentials).handler({
				ticker: 'sxr8',
				expense_ratio: '0,07%',
			}),
		)

		assert.equal(payload.action, 'updated')
		assert.equal(payload.catalogSize, 1)

		const catalog = await fetchCatalog()
		assert.equal(catalog.length, 1)
		assert.equal(catalog[0].id, 'IE00B5BMR087:SXR8')
		assert.equal(catalog[0].isin, 'IE00B5BMR087')
		assert.equal(catalog[0].expense_ratio, '0,07%')
		assert.equal(catalog[0].name, 'iShares Core S&P 500')
	})

	it('needs a name and a type to add a fund the catalog does not have', async () => {
		stubCatalog()
		const tool = createUpsertCatalogEntryTool(credentials)
		await assert.rejects(
			async () => tool.handler({ ticker: 'SXR8' }),
			/not in the catalog yet, so "name" and "type" are required/,
		)

		const payload = payloadOf(
			await tool.handler({
				ticker: 'sxr8',
				name: 'iShares Core S&P 500',
				type: 'equity',
				isin: 'IE00B5BMR087',
			}),
		)
		assert.equal(payload.action, 'created')
		const saved = (await fetchCatalog()).find((row) => row.ticker === 'SXR8')
		// The id follows the same rule the bank import would compute.
		assert.equal(saved?.id, 'IE00B5BMR087:SXR8')
		assert.equal(payload.catalogSize, 4)
	})

	it('rejects an unknown asset class instead of storing it', async () => {
		stubCatalog()
		await assert.rejects(
			async () =>
				createUpsertCatalogEntryTool(credentials).handler({
					ticker: 'SXR8',
					name: 'iShares Core S&P 500',
					type: 'crypto',
				}),
			/"type" must be one of/,
		)
	})

	it('refuses to save an invalid ISIN, checking the built row the same way a bank import would', async () => {
		stubCatalog()
		await assert.rejects(
			async () =>
				createUpsertCatalogEntryTool(credentials).handler({
					ticker: 'SXR8',
					name: 'iShares Core S&P 500',
					type: 'equity',
					isin: 'not-an-isin',
				}),
			/Invalid catalog entry: "isin" is not a valid ISIN/,
		)
		assert.equal(
			(await fetchCatalog()).some((row) => row.ticker === 'SXR8'),
			false,
		)
	})

	it('refuses a risk_kid outside 1-7', async () => {
		stubCatalog()
		await assert.rejects(
			async () =>
				createUpsertCatalogEntryTool(credentials).handler({
					ticker: 'AGGH',
					risk_kid: 9,
				}),
			/Invalid catalog entry: "risk_kid" must be a whole number from 1 to 7/,
		)
		const saved = (await fetchCatalog()).find((row) => row.ticker === 'AGGH')
		// The bad value never overwrote the existing, valid one.
		assert.equal(saved?.risk_kid, 2)
	})

	it('removes a fund by ticker and reports what is left', async () => {
		stubCatalog()
		const payload = payloadOf(
			await createDeleteCatalogEntryTool(credentials).handler({
				ticker: 'IPRP',
			}),
		)
		assert.equal(payload.action, 'deleted')
		assert.equal(payload.catalogSize, 2)
		const catalog = await fetchCatalog()
		assert.equal(
			catalog.some((row) => row.ticker === 'IPRP'),
			false,
		)
	})

	it('says nothing was removed when the fund is not there', async () => {
		stubCatalog()
		await assert.rejects(
			async () =>
				createDeleteCatalogEntryTool(credentials).handler({ ticker: 'NOPE' }),
			/nothing was removed/,
		)
		assert.equal((await fetchCatalog()).length, 3)
	})
})

describe('import_catalog_from_bank_file tool', () => {
	/** A bank export on disk, as the tool expects to find one. */
	async function writeExport(payload: unknown): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), 'ainvestor-import-'))
		const filePath = join(directory, 'bank.json')
		await writeFile(filePath, JSON.stringify(payload), 'utf8')
		return filePath
	}

	const bankPayload = {
		data: [
			{
				ticker: 'SXR8',
				fund_name: 'iShares Core S&P 500',
				isin: 'IE00B5BMR087',
				assets: 'akcje',
				expense_ratio: '0,07%',
			},
			{ fund_name: 'Missing ticker' },
		],
	}

	it('previews without saving when asked to', async () => {
		stubCatalog()
		const filePath = await writeExport(bankPayload)
		const payload = payloadOf(
			await createImportCatalogFromBankFileTool(credentials).handler({
				filePath,
				dryRun: true,
			}),
		)

		assert.equal(payload.action, 'previewed')
		assert.equal(payload.appliedRows, 1)
		assert.equal(payload.added, 1)
		assert.equal((payload.skipped as { count: number }).count, 1)
		// Nothing landed in the catalog.
		assert.equal((await fetchCatalog()).length, 3)
	})

	it('merges the file into the catalog when applied', async () => {
		stubCatalog()
		const filePath = await writeExport(bankPayload)
		const payload = payloadOf(
			await createImportCatalogFromBankFileTool(credentials).handler({
				filePath,
			}),
		)

		assert.equal(payload.action, 'imported')
		assert.equal(payload.catalogSizeAfter, 4)
		const saved = (await fetchCatalog()).find((row) => row.ticker === 'SXR8')
		assert.equal(saved?.expense_ratio, '0,07%')
	})

	it('checks catalog ownership before it touches the filesystem', async () => {
		stubCatalog({ login: 'someone-else' })
		await assert.rejects(
			async () =>
				createImportCatalogFromBankFileTool(credentials).handler({
					filePath: '/nonexistent/path.json',
				}),
			/Only the catalog's owner can change it/,
		)
	})

	it('explains a file that is missing, unparseable, or not a bank payload', async () => {
		stubCatalog()
		const tool = createImportCatalogFromBankFileTool(credentials)
		await assert.rejects(
			async () => tool.handler({ filePath: '/nonexistent/path.json' }),
			/No file at "\/nonexistent\/path.json"/,
		)
		await assert.rejects(async () => tool.handler({}), /"filePath" is required/)

		const noDataArray = await writeExport({ something: 'else' })
		await assert.rejects(
			async () => tool.handler({ filePath: noDataArray }),
			/no `data` array/,
		)

		const notAnObject = await writeExport([1, 2])
		await assert.rejects(
			async () => tool.handler({ filePath: notAnObject }),
			/does not contain a bank API response object/,
		)
	})
})
