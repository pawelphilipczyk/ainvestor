import type { EtfType } from '../../lib/guidelines.ts'

export const CATALOG_FILENAME = 'catalog.json'

export type CatalogEntry = {
	id: string
	ticker: string
	name: string
	type: EtfType
	description: string
	isin?: string
	/** Expense ratio (e.g. "0,35%") — for cost comparison. */
	expense_ratio?: string
	/** Risk scale 1–7 (PRIIPs KID). */
	risk_kid?: number
	/** Geographic region (e.g. "Świat", "Europa"). */
	region?: string
	/** Sector (e.g. "technologia", "nieruchomości"). */
	sector?: string
	/** Annual rate of return (%). */
	rate_of_return?: number
	/** Volatility (e.g. "19,16%"). */
	volatility?: string
	/** Return/risk ratio. */
	return_risk?: string
	/** Fund size (e.g. "166 mln USD"). */
	fund_size?: string
	/** ESG-compliant. */
	esg?: boolean
}

// ---------------------------------------------------------------------------
// Bank API JSON parsing
// ---------------------------------------------------------------------------

/** Raw item shape from bank/investment website fetch response. */
export type BankEtfItem = {
	isin?: string
	fund_name?: string
	expense_ratio?: string
	ticker?: string
	description?: string
	assets?: string
	sector?: string
	region?: string
	risk_kid?: number
	rate_of_return?: number
	volatility?: string
	return_risk?: string
	fund_size?: string
	esg?: string
	id?: string
}

/** Bank API response shape: { data: BankEtfItem[], count?, total_count? }. */
export type BankEtfResponse = {
	data?: BankEtfItem[]
	count?: number
	total_count?: number
}

function normaliseTypeFromBank(assets: string, sector: string): EtfType {
	const a = (assets ?? '').toLowerCase()
	const s = (sector ?? '').toLowerCase()
	if (a.includes('obligac')) return 'bond'
	if (a.includes('mieszany')) return 'mixed'
	if (s.includes('nieruchomo')) return 'real_estate'
	if (s.includes('surowce') || s.includes('towar')) return 'commodity'
	if (a.includes('akcje') || a.includes('akcj')) return 'equity'
	return 'equity'
}

/**
 * Parse bank/investment website fetch response JSON into CatalogEntry array.
 * Extracts only investment-relevant fields; dedupes by ISIN or ticker within the batch.
 */
export function parseBankJsonToCatalog(json: unknown): CatalogEntry[] {
	if (!json || typeof json !== 'object') return []
	const obj = json as Record<string, unknown>
	const data = obj.data
	if (!Array.isArray(data)) return []

	const entries: CatalogEntry[] = []
	for (const item of data as BankEtfItem[]) {
		const ticker = (item.ticker ?? '').trim()
		const name = (item.fund_name ?? '').trim()
		if (!ticker || !name) continue

		const id =
			(item.id ?? `${item.isin ?? ''}_${ticker}`).trim() || crypto.randomUUID()
		const type = normaliseTypeFromBank(item.assets ?? '', item.sector ?? '')
		const description = (item.description ?? '').trim()

		const entry: CatalogEntry = {
			id,
			ticker: ticker.toUpperCase(),
			name,
			type,
			description,
			...(item.isin ? { isin: item.isin } : {}),
			...(item.expense_ratio ? { expense_ratio: item.expense_ratio } : {}),
			...(typeof item.risk_kid === 'number' ? { risk_kid: item.risk_kid } : {}),
			...(item.region ? { region: item.region } : {}),
			...(item.sector ? { sector: item.sector } : {}),
			...(typeof item.rate_of_return === 'number'
				? { rate_of_return: item.rate_of_return }
				: {}),
			...(item.volatility ? { volatility: item.volatility } : {}),
			...(item.return_risk ? { return_risk: item.return_risk } : {}),
			...(item.fund_size ? { fund_size: item.fund_size } : {}),
			...(item.esg === 'tak'
				? { esg: true }
				: item.esg === 'nie'
					? { esg: false }
					: {}),
		}
		entries.push(entry)
	}
	return dedupeCatalogBatch(entries)
}

/** Normalise ISIN for matching (trim, uppercase). */
export function normalizeIsinForKey(isin: string | undefined): string | null {
	if (!isin) return null
	const s = isin.trim().toUpperCase()
	return s.length === 0 ? null : s
}

/** Normalise ticker for stable merge keys (trim, uppercase, collapse spaces). */
export function normalizeTickerForKey(ticker: string): string {
	return ticker.trim().toUpperCase().replace(/\s+/g, ' ')
}

/**
 * Stable key for catalog dedupe/merge: one row per ISIN when present,
 * otherwise one row per normalised ticker (funds without ISIN in the feed).
 */
export function catalogMergeKey(entry: CatalogEntry): string {
	const isin = normalizeIsinForKey(entry.isin)
	if (isin) return `i:${isin}`
	return `t:${normalizeTickerForKey(entry.ticker)}`
}

function mergeCatalogFields(
	prev: CatalogEntry,
	next: CatalogEntry,
): CatalogEntry {
	return { ...prev, ...next, id: prev.id }
}

function upsertCatalogEntryIntoMap(
	byKey: Map<string, CatalogEntry>,
	entry: CatalogEntry,
) {
	function findIsinKeyByTicker(ticker: string): string | undefined {
		const norm = normalizeTickerForKey(ticker)
		for (const [k, v] of byKey) {
			if (k.startsWith('i:') && normalizeTickerForKey(v.ticker) === norm)
				return k
		}
		return undefined
	}

	const isin = normalizeIsinForKey(entry.isin)
	const ticker = normalizeTickerForKey(entry.ticker)

	if (isin) {
		const iKey = `i:${isin}`
		const existingIsin = byKey.get(iKey)
		if (existingIsin) {
			byKey.set(iKey, mergeCatalogFields(existingIsin, entry))
			return
		}
		const tKey = `t:${ticker}`
		const tickerOnly = byKey.get(tKey)
		if (tickerOnly) {
			byKey.delete(tKey)
			byKey.set(
				iKey,
				mergeCatalogFields(tickerOnly, { ...entry, id: tickerOnly.id }),
			)
			return
		}
		byKey.set(iKey, entry)
		return
	}

	const tKey = `t:${ticker}`
	const existingTicker = byKey.get(tKey)
	if (existingTicker) {
		byKey.set(tKey, mergeCatalogFields(existingTicker, entry))
		return
	}

	const isinKey = findIsinKeyByTicker(ticker)
	const isinRow = isinKey ? byKey.get(isinKey) : undefined
	if (isinKey && isinRow) {
		byKey.set(
			isinKey,
			mergeCatalogFields(isinRow, { ...entry, id: isinRow.id }),
		)
		return
	}

	byKey.set(tKey, entry)
}

/** Collapse duplicate rows in one import batch (same ISIN or same ticker-only key). */
function dedupeCatalogBatch(entries: CatalogEntry[]): CatalogEntry[] {
	const byKey = new Map<string, CatalogEntry>()
	for (const e of entries) {
		upsertCatalogEntryIntoMap(byKey, e)
	}
	return [...byKey.values()]
}

/**
 * Merge newly imported bank entries into existing catalog.
 * Updates rows that match by ISIN (preferred) or by normalised ticker, without
 * creating duplicate rows when ticker formatting differs or ISIN is added later.
 */
export function mergeBankIntoCatalog(
	existing: CatalogEntry[],
	incoming: CatalogEntry[],
): CatalogEntry[] {
	const byKey = new Map<string, CatalogEntry>()
	for (const e of existing) {
		upsertCatalogEntryIntoMap(byKey, e)
	}
	for (const e of incoming) {
		upsertCatalogEntryIntoMap(byKey, e)
	}
	return [...byKey.values()]
}

// ---------------------------------------------------------------------------
// Gist helpers
// ---------------------------------------------------------------------------

type GistFile = {
	content: string | null
}

type GistPayload = {
	files: Record<string, GistFile>
}

/** Parse catalog entries from a raw GitHub Gist API response object. */
export function parseCatalogFromGist(gist: GistPayload): CatalogEntry[] {
	const file = gist.files[CATALOG_FILENAME]
	if (!file || !file.content) return []
	try {
		const parsed = JSON.parse(file.content)
		return Array.isArray(parsed) ? (parsed as CatalogEntry[]) : []
	} catch {
		return []
	}
}

/** Build a PATCH-ready body to update the catalog file in a gist. */
export function buildCatalogGistPatch(entries: CatalogEntry[]): {
	files: Record<string, { content: string }>
} {
	return {
		files: {
			[CATALOG_FILENAME]: {
				content: JSON.stringify(entries, null, 2),
			},
		},
	}
}

const GITHUB_API = 'https://api.github.com'

function githubHeaders(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': '2022-11-28',
	}
}

/** Fetch catalog entries from an existing gist by ID. */
export async function fetchCatalog(
	token: string,
	gistId: string,
): Promise<CatalogEntry[]> {
	const res = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		headers: githubHeaders(token),
	})
	if (!res.ok) return []
	const gist = (await res.json()) as GistPayload
	return parseCatalogFromGist(gist)
}

/** Save catalog entries to an existing gist by ID. */
export async function saveCatalog(
	token: string,
	gistId: string,
	entries: CatalogEntry[],
): Promise<void> {
	await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify(buildCatalogGistPatch(entries)),
	})
}
