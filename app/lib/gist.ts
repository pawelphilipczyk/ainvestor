import { type CatalogEntry, fetchCatalog } from '../features/catalog/lib.ts'
import {
	putPrivateGistTestEtfs,
	takePrivateGistTestEtfs,
} from './private-gist-test-store.ts'
import {
	isVersionConflict,
	readFile,
	writeFile,
} from './store/github-repo-store.ts'
import {
	type ChangeOutcome,
	readModifyWrite,
	WriteConflictError,
} from './store/read-modify-write.ts'

export const GIST_FILENAME = 'etfs.json'

export type EtfEntry = {
	id: string
	name: string
	/** Present when the row was added from the catalog (matches catalog ticker). */
	ticker?: string
	value: number
	currency: string
	exchange?: string
}

/**
 * Normalizes portfolio rows from JSON (gist or guest session). Legacy `quantity` is dropped.
 */
export function normalizeStoredEtfEntries(rows: unknown): EtfEntry[] {
	if (!Array.isArray(rows)) return []
	const out: EtfEntry[] = []
	for (const row of rows) {
		if (!row || typeof row !== 'object') continue
		const record = row as Record<string, unknown>
		if (typeof record.id !== 'string' || typeof record.name !== 'string')
			continue
		const value =
			typeof record.value === 'number' ? record.value : Number(record.value)
		if (Number.isNaN(value)) continue
		const currencyRaw =
			typeof record.currency === 'string' ? record.currency.trim() : ''
		out.push({
			id: record.id,
			name: record.name,
			value,
			currency: currencyRaw.length > 0 ? currencyRaw : 'PLN',
			...(typeof record.ticker === 'string' ? { ticker: record.ticker } : {}),
			...(typeof record.exchange === 'string' && record.exchange.trim() !== ''
				? { exchange: record.exchange.trim() }
				: {}),
		})
	}
	return out
}

type GistFile = {
	content: string | null
}

type GistPayload = {
	files: Record<string, GistFile>
}

/** Parse ETF entries from a raw GitHub Gist API response object. */
export function parseEtfsFromGist(gist: GistPayload): EtfEntry[] {
	const file = gist.files[GIST_FILENAME]
	if (!file || !file.content) return []
	try {
		const parsed: unknown = JSON.parse(file.content)
		return normalizeStoredEtfEntries(parsed)
	} catch {
		return []
	}
}

/** Fetch ETF entries from a gist by ID. */
export async function fetchEtfs(
	token: string,
	dataRepo: string,
): Promise<EtfEntry[]> {
	const testEtfs = takePrivateGistTestEtfs(token, dataRepo)
	if (testEtfs !== null) return testEtfs
	const result = await readFile({
		token,
		location: dataRepo,
		path: GIST_FILENAME,
	})
	if (!result.ok) {
		throw new Error(`GitHub API error fetching the portfolio: ${result.status}`)
	}
	return parseEtfsFromGist({
		files: result.file
			? { [GIST_FILENAME]: { content: result.file.content } }
			: {},
	})
}

/** The holdings and the version of the file they came from; `null` when it does not exist yet. */
async function fetchEtfsWithVersion(
	token: string,
	dataRepo: string,
): Promise<{ value: EtfEntry[]; version: string | null }> {
	const testEtfs = takePrivateGistTestEtfs(token, dataRepo)
	if (testEtfs !== null) return { value: testEtfs, version: null }
	const result = await readFile({
		token,
		location: dataRepo,
		path: GIST_FILENAME,
	})
	if (!result.ok) {
		throw new Error(`GitHub API error fetching the portfolio: ${result.status}`)
	}
	return {
		value: parseEtfsFromGist({
			files: result.file
				? { [GIST_FILENAME]: { content: result.file.content } }
				: {},
		}),
		version: result.file?.version ?? null,
	}
}

/**
 * Edit the holdings with compare-and-swap: reads them, lets `change` decide
 * from what it sees, and saves only if the file is still the version read. A
 * save that lost a race reads again and redoes `change` on the newer holdings;
 * after {@link MAX_WRITE_ATTEMPTS} losses in a row it throws a
 * {@link WriteConflictError}. `change` runs once per attempt, so it must be
 * free of side effects.
 */
export function updateEtfs<TResult>(params: {
	token: string
	dataRepo: string
	change: (current: EtfEntry[]) => ChangeOutcome<EtfEntry[], TResult>
}): Promise<TResult> {
	const { token, dataRepo } = params
	return readModifyWrite({
		what: 'the portfolio',
		read: () => fetchEtfsWithVersion(token, dataRepo),
		change: params.change,
		write: async ({ value, version, message }) => {
			if (putPrivateGistTestEtfs(token, dataRepo, value)) return
			const result = await writeFile({
				token,
				location: dataRepo,
				path: GIST_FILENAME,
				content: JSON.stringify(value, null, 2),
				expectedVersion: version,
				message,
			})
			if (result.ok) return
			if (
				isVersionConflict({
					status: result.status,
					expectedVersion: version,
				})
			) {
				throw new WriteConflictError('the portfolio')
			}
			const detail = await result.response.text().catch(() => '')
			throw new Error(
				`GitHub API error saving the portfolio: ${result.status}${detail ? ` ${detail}` : ''}`,
			)
		},
	})
}

/**
 * One private Gist GET for holdings plus one shared catalog read.
 */
export async function fetchPortfolioSnapshot(
	token: string,
	dataRepo: string,
): Promise<{ entries: EtfEntry[]; catalog: CatalogEntry[] }> {
	const [entries, catalog] = await Promise.all([
		fetchEtfs(token, dataRepo),
		fetchCatalog(token),
	])
	return {
		entries,
		catalog,
	}
}
