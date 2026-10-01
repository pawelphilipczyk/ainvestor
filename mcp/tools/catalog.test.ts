import * as assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import type { CatalogEntry } from '../../app/features/catalog/lib.ts'
import {
	CATALOG_FILENAME,
	fetchCatalog,
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
	setSharedCatalogWriteAccessForTests,
	updateSharedCatalog,
} from '../../app/features/catalog/lib.ts'
import { installFakeDataRepo } from '../../app/lib/store/github-repo-test-fake.ts'
import { resetApprovedCallerCache } from '../approved-caller.ts'
import type { DataRepoCredentials } from '../data-repo.ts'
import {
	createDeleteCatalogEntryTool,
	createGetCatalogEntryTool,
	createListCatalogTool,
	createUpsertCatalogEntryTool,
	summarizeCatalogSearch,
} from './catalog.ts'
import { createImportCatalogFromBankFileTool } from './catalog-import.ts'

const credentials: DataRepoCredentials = {
	githubToken: 'owner-token',
	dataRepo: 'pinned-gist',
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

/** Seed the shared catalog, and whether this token may push to its repo. */
function stubCatalog(
	params: { canWrite?: boolean; entries?: CatalogEntry[] } = {},
) {
	setSharedCatalogForTests({
		entries: params.entries ?? CATALOG,
	})
	setSharedCatalogWriteAccessForTests(params.canWrite ?? true)
}

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	resetSharedCatalogForTests()
	resetApprovedCallerCache()
})

/** The stored source rows, read the way a catalog edit sees them. */
function storedSourceRows() {
	return updateSharedCatalog({
		token: credentials.githubToken,
		change: ({ sourceRowsById }) => ({ result: sourceRowsById }),
	})
}

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

	it('blames an empty catalog on the catalog, not on there being no matches', () => {
		// A failed read with no earlier copy comes back as no rows, so an empty
		// catalog must not read as "the app knows no funds" during an outage.
		const summary = summarizeCatalogSearch({
			catalog: [],
			query: '',
			limit: 10,
		})
		assert.equal(summary.catalogSize, 0)
		assert.equal(summary.truncated, false)
		assert.match(String(summary.note), /empty or temporarily unreachable/)
	})
})

describe('list_catalog tool', () => {
	it('caps the limit so a huge catalog cannot flood the context', async () => {
		stubCatalog()
		const payload = payloadOf(
			await createListCatalogTool(credentials).handler({ limit: 5000 }),
		)
		assert.equal(payload.returned, 3)
		assert.match(
			createListCatalogTool(credentials).description,
			/only source of valid tickers/,
		)
	})

	it('reads the catalog from the catalog repo with the caller token', async () => {
		const originalTtl = process.env.SHARED_CATALOG_CACHE_TTL_MS
		process.env.SHARED_CATALOG_CACHE_TTL_MS = '0'
		installFakeDataRepo({
			login: 'ainvestor-shared',
			repoName: 'ainvestor-catalog',
			files: { [CATALOG_FILENAME]: JSON.stringify([entry()]) },
		})
		const repoFetch = globalThis.fetch
		const authorizations: Array<string | null> = []
		globalThis.fetch = async (input, init) => {
			authorizations.push(new Headers(init?.headers).get('authorization'))
			return repoFetch(input, init)
		}
		try {
			const payload = payloadOf(
				await createListCatalogTool(credentials).handler({}),
			)
			assert.equal(payload.catalogSize, 1)
			assert.deepEqual(authorizations, ['Bearer owner-token'])
		} finally {
			if (originalTtl === undefined)
				delete process.env.SHARED_CATALOG_CACHE_TTL_MS
			else process.env.SHARED_CATALOG_CACHE_TTL_MS = originalTtl
		}
	})

	it('warns that formatted fields are not numbers', async () => {
		assert.match(
			createListCatalogTool(credentials).description,
			/display strings/,
		)
		assert.match(
			createGetCatalogEntryTool(credentials).description,
			/display strings/,
		)
	})

	it('rejects a limit that is not a positive number', async () => {
		stubCatalog()
		await assert.rejects(
			async () => createListCatalogTool(credentials).handler({ limit: 0 }),
			/"limit" must be a positive number/,
		)
	})

	it('tells the model when the token cannot read the private catalog, rather than that it is empty', async () => {
		const originalTtl = process.env.SHARED_CATALOG_CACHE_TTL_MS
		process.env.SHARED_CATALOG_CACHE_TTL_MS = '0'
		// GitHub's 404 for a private repo the account cannot see.
		installFakeDataRepo({
			login: 'ainvestor-shared',
			repoName: 'ainvestor-catalog',
			absent: true,
		})
		const originalError = console.error
		console.error = () => {}
		try {
			const payload = payloadOf(
				await createListCatalogTool(credentials).handler({}),
			)
			assert.equal(payload.catalogSize, 0)
			assert.match(String(payload.note), /cannot read the shared catalog/)
			assert.match(String(payload.note), /ainvestor-users team/)
		} finally {
			console.error = originalError
			if (originalTtl === undefined)
				delete process.env.SHARED_CATALOG_CACHE_TTL_MS
			else process.env.SHARED_CATALOG_CACHE_TTL_MS = originalTtl
		}
	})
})

describe('get_catalog_entry tool', () => {
	it('finds an entry by ticker regardless of case, and by id', async () => {
		stubCatalog()
		const tool = createGetCatalogEntryTool(credentials)
		const byTicker = payloadOf(await tool.handler({ ticker: 'vwce' }))
		assert.equal(byTicker.id, 't:VWCE')
		const byId = payloadOf(await tool.handler({ id: 't:AGGH' }))
		assert.equal(byId.ticker, 'AGGH')
		// The full record, unlike the search projection.
		assert.equal(byId.description, 'Obligacje światowe')
	})

	it('asks for one of the two identifiers, and reports an unknown one', async () => {
		stubCatalog()
		const tool = createGetCatalogEntryTool(credentials)
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
	it('refuses a token GitHub would not let push to the catalog repo, naming the repo', async () => {
		stubCatalog({ canWrite: false })
		await assert.rejects(
			async () =>
				createUpsertCatalogEntryTool(credentials).handler({
					ticker: 'VWCE',
					expense_ratio: '0,22%',
				}),
			/cannot push to ainvestor-shared\/ainvestor-catalog/,
		)
		// Nothing was written.
		const catalog = await fetchCatalog(credentials.githubToken)
		assert.equal(
			catalog.find((row) => row.ticker === 'VWCE')?.expense_ratio,
			undefined,
		)
	})

	it('refuses a delete from a token without push access too', async () => {
		stubCatalog({ canWrite: false })
		await assert.rejects(
			async () =>
				createDeleteCatalogEntryTool(credentials).handler({ ticker: 'VWCE' }),
			/cannot push to ainvestor-shared\/ainvestor-catalog/,
		)
		assert.equal((await fetchCatalog(credentials.githubToken)).length, 3)
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
		const saved = (await fetchCatalog(credentials.githubToken)).find(
			(row) => row.ticker === 'AGGH',
		)
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

		const catalog = await fetchCatalog(credentials.githubToken)
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
		const saved = (await fetchCatalog(credentials.githubToken)).find(
			(row) => row.ticker === 'SXR8',
		)
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
			(await fetchCatalog(credentials.githubToken)).some(
				(row) => row.ticker === 'SXR8',
			),
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
		const saved = (await fetchCatalog(credentials.githubToken)).find(
			(row) => row.ticker === 'AGGH',
		)
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
		const catalog = await fetchCatalog(credentials.githubToken)
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
		assert.equal((await fetchCatalog(credentials.githubToken)).length, 3)
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
		assert.equal((await fetchCatalog(credentials.githubToken)).length, 3)
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
		const saved = (await fetchCatalog(credentials.githubToken)).find(
			(row) => row.ticker === 'SXR8',
		)
		assert.equal(saved?.expense_ratio, '0,07%')
		assert.equal(saved?.assets, 'akcje')
		const sourceRows = await storedSourceRows()
		assert.equal(
			(saved && (sourceRows[saved.id] as { ticker?: string }))?.ticker,
			'SXR8',
		)
	})

	it('reports unclassified rows and stores nothing on a dry run', async () => {
		stubCatalog()
		const filePath = await writeExport({
			data: [
				{ ticker: 'BTC', fund_name: 'Bitcoin FIZ', assets: 'kryptowaluty' },
			],
		})
		const payload = payloadOf(
			await createImportCatalogFromBankFileTool(credentials).handler({
				filePath,
				dryRun: true,
			}),
		)
		assert.deepEqual(payload.unclassified, {
			count: 1,
			rows: ['BTC — Bitcoin FIZ'],
		})
		assert.deepEqual(await storedSourceRows(), {})
	})

	it('checks catalog write access before it touches the filesystem', async () => {
		stubCatalog({ canWrite: false })
		await assert.rejects(
			async () =>
				createImportCatalogFromBankFileTool(credentials).handler({
					filePath: '/nonexistent/path.json',
				}),
			/Only its maintainers in the ainvestor-shared organization can change it/,
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
