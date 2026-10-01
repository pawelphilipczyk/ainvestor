import { type CatalogEntry, fetchCatalog } from '../features/catalog/lib.ts'
import { isPreview } from './deployment.ts'
import {
	putPrivateGistTestEtfs,
	takePrivateGistTestEtfs,
} from './private-gist-test-store.ts'
import { readFile, writeFile } from './store/github-repo-store.ts'
import { githubHeaders } from './store/github-store.ts'

export const GIST_FILENAME = 'etfs.json'

/** Gist description for a deployment environment (the running one by default). Preview uses separate gists from production. */
export function getGistDescription(
	options: { preview?: boolean } = {},
): string {
	const preview = options.preview ?? isPreview()
	return preview ? 'ai-investor-preview-data' : 'ai-investor-data'
}

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

const GITHUB_API = 'https://api.github.com'

/** GitHub caps `per_page` at 100; the default of 30 would hide older gists. */
const GISTS_PER_PAGE = 100

/** Safety cap on paging through `GET /gists` (100 × 50 = 5000 gists). */
const MAX_GIST_LIST_PAGES = 50

type GistListItem = {
	id: string
	description: string | null
}

/**
 * Find the ai-investor gist by description, paging through every gist the token
 * can see. Without pagination GitHub returns only the 30 most recently updated
 * gists, so an account with more than that could hide the gist. When
 * duplicates exist, the most recently updated one wins (GitHub's default list
 * order). Used by the migration script until the gists are retired.
 */
export async function findGistIdByDescription(
	token: string,
	description: string,
): Promise<string | null> {
	for (let page = 1; page <= MAX_GIST_LIST_PAGES; page++) {
		const response = await fetch(
			`${GITHUB_API}/gists?per_page=${GISTS_PER_PAGE}&page=${page}`,
			{ headers: githubHeaders(token) },
		)

		if (!response.ok) {
			throw new Error(`GitHub API error listing gists: ${response.status}`)
		}

		const gists = (await response.json()) as GistListItem[]
		// Not a miss — an answer we cannot read. Returning null here would tell
		// the caller the gist does not exist, when nothing was proven.
		if (!Array.isArray(gists)) {
			throw new Error('GitHub API returned a non-array gist listing')
		}

		const existing = gists.find((gist) => gist.description === description)
		if (existing) return existing.id

		// A short page is the last page, so the gist genuinely does not exist.
		if (gists.length < GISTS_PER_PAGE) return null
	}
	// Distinct from `null`: we ran out of pages without proving anything, and a
	// caller must not read that as "no such gist".
	throw new Error(
		`GitHub API returned more than ${MAX_GIST_LIST_PAGES * GISTS_PER_PAGE} gists without matching "${description}"`,
	)
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

/** Save ETF entries to a gist by ID. */
export async function saveEtfs(
	token: string,
	dataRepo: string,
	entries: EtfEntry[],
): Promise<void> {
	if (putPrivateGistTestEtfs(token, dataRepo, entries)) return
	const result = await writeFile({
		token,
		location: dataRepo,
		path: GIST_FILENAME,
		content: JSON.stringify(entries, null, 2),
	})
	if (!result.ok) {
		const detail = await result.response.text().catch(() => '')
		throw new Error(
			`GitHub API error saving the portfolio: ${result.status}${detail ? ` ${detail}` : ''}`,
		)
	}
}
