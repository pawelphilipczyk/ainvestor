import {
	ETF_TYPES,
	type EtfType,
	formatEtfTypeLabel,
} from '../../lib/guidelines.ts'

export const CATALOG_FILENAME = 'catalog.json'
const GITHUB_API = 'https://api.github.com'

type SharedCatalogSnapshot = {
	entries: CatalogEntry[]
	ownerLogin: string | null
}

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

/** Unique ETF types present in the catalog, in canonical `ETF_TYPES` order. */
export function uniqueEtfTypesFromCatalog(catalog: CatalogEntry[]): EtfType[] {
	const seen = new Set<EtfType>()
	for (const e of catalog) {
		seen.add(e.type)
	}
	return ETF_TYPES.filter((etfType) => seen.has(etfType))
}

/**
 * Dropdown options for asset-class guidelines: types that appear in the catalog.
 * When the catalog is empty, falls back to all `ETF_TYPES` so the form still works.
 */
export function assetClassSelectOptionsFromCatalog(
	catalog: CatalogEntry[],
): { value: EtfType; label: string }[] {
	const types = uniqueEtfTypesFromCatalog(catalog)
	const ordered = types.length > 0 ? types : [...ETF_TYPES]
	return ordered.map((etfType) => ({
		value: etfType,
		label: formatEtfTypeLabel(etfType),
	}))
}

/** Lookup by ticker (case-insensitive). */
export function findCatalogEntryByTicker(
	catalog: CatalogEntry[],
	ticker: string,
): CatalogEntry | undefined {
	const normalisedTicker = ticker.trim().toUpperCase()
	if (!normalisedTicker) return undefined
	return catalog.find(
		(entry) => entry.ticker.toUpperCase() === normalisedTicker,
	)
}

/** Options for picking a specific fund from the catalog (guidelines instrument rows). */
export function instrumentSelectOptionsFromCatalog(
	catalog: CatalogEntry[],
): { value: string; label: string }[] {
	return [...catalog]
		.sort((a, b) => a.ticker.localeCompare(b.ticker))
		.map((e) => ({
			value: e.ticker,
			label: `${e.ticker} — ${e.name}`,
		}))
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
	const assetsLower = (assets ?? '').toLowerCase()
	const sectorLower = (sector ?? '').toLowerCase()
	if (assetsLower.includes('obligac')) return 'bond'
	if (assetsLower.includes('mieszany')) return 'mixed'
	if (sectorLower.includes('nieruchomo')) return 'real_estate'
	if (sectorLower.includes('surowce') || sectorLower.includes('towar'))
		return 'commodity'
	if (assetsLower.includes('akcje') || assetsLower.includes('akcj'))
		return 'equity'
	return 'equity'
}

/**
 * Parse bank/investment website fetch response JSON into CatalogEntry array.
 * Extracts only investment-relevant fields. Duplicate rows collapse when merged
 * (see {@link mergeBankIntoCatalog}).
 */
export function parseBankJsonToCatalog(json: unknown): CatalogEntry[] {
	if (!json || typeof json !== 'object') return []
	const payload = json as Record<string, unknown>
	const data = payload.data
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
	return entries
}

function normalizeIsinForMerge(isin: string | undefined): string | null {
	if (!isin) return null
	const normalised = isin.trim().toUpperCase()
	return normalised.length === 0 ? null : normalised
}

function normalizeTickerForMerge(ticker: string): string {
	return ticker.trim().toUpperCase().replace(/\s+/g, ' ')
}

/**
 * Map key for merge/dedupe: one slot per share-class listing (ISIN + trading line).
 * The same ISIN may list on multiple venues (different tickers, e.g. Xetra vs LSE);
 * those must stay separate rows. When ISIN is absent, the key is ticker-only.
 */
export function catalogMergeKey(entry: CatalogEntry): string {
	const isin = normalizeIsinForMerge(entry.isin)
	const tickerKey = normalizeTickerForMerge(entry.ticker)
	if (isin) return `i:${isin}|t:${tickerKey}`
	return `t:${tickerKey}`
}

function mergeCatalogRow(
	existingRow: CatalogEntry,
	incomingRow: CatalogEntry,
): CatalogEntry {
	return { ...existingRow, ...incomingRow, id: existingRow.id }
}

/**
 * Merge imported rows into the catalog. Rows with the same merge key (same ISIN
 * and same normalised ticker when ISIN is present) update the existing row
 * (incoming fields win; `id` is kept from the first).
 */
export function mergeBankIntoCatalog(
	existing: CatalogEntry[],
	incoming: CatalogEntry[],
): CatalogEntry[] {
	const byKey = new Map<string, CatalogEntry>()
	for (const entry of existing) {
		const mergeKey = catalogMergeKey(entry)
		const existingAtKey = byKey.get(mergeKey)
		byKey.set(
			mergeKey,
			existingAtKey ? mergeCatalogRow(existingAtKey, entry) : entry,
		)
	}
	for (const entry of incoming) {
		const mergeKey = catalogMergeKey(entry)
		const existingAtKey = byKey.get(mergeKey)
		byKey.set(
			mergeKey,
			existingAtKey ? mergeCatalogRow(existingAtKey, entry) : entry,
		)
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
	owner?: {
		login?: string
	}
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

let sharedCatalogTestSnapshot: SharedCatalogSnapshot | null = null

function cloneCatalogEntries(entries: CatalogEntry[]): CatalogEntry[] {
	return entries.map((entry) => ({ ...entry }))
}

function cloneSharedCatalogSnapshot(
	snapshot: SharedCatalogSnapshot,
): SharedCatalogSnapshot {
	return {
		entries: cloneCatalogEntries(snapshot.entries),
		ownerLogin: snapshot.ownerLogin,
	}
}

function getSharedCatalogGistId(): string | null {
	const gistId = (process.env.SHARED_CATALOG_GIST_ID ?? '').trim()
	return gistId.length > 0 ? gistId : null
}

export function setSharedCatalogForTests(
	snapshot: SharedCatalogSnapshot,
): void {
	sharedCatalogTestSnapshot = cloneSharedCatalogSnapshot(snapshot)
}

export function resetSharedCatalogForTests(): void {
	sharedCatalogTestSnapshot = null
}

function githubHeaders(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': '2022-11-28',
	}
}

export function isSharedCatalogAdmin(params: {
	sessionLogin: string | null | undefined
	ownerLogin: string | null | undefined
}): boolean {
	const { sessionLogin, ownerLogin } = params
	if (!sessionLogin || !ownerLogin) return false
	return sessionLogin.trim().toLowerCase() === ownerLogin.trim().toLowerCase()
}

export async function fetchSharedCatalogSnapshot(): Promise<SharedCatalogSnapshot> {
	if (sharedCatalogTestSnapshot) {
		return cloneSharedCatalogSnapshot(sharedCatalogTestSnapshot)
	}

	const gistId = getSharedCatalogGistId()
	if (!gistId) {
		return { entries: [], ownerLogin: null }
	}

	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		headers: {
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		},
	})
	if (!response.ok) return { entries: [], ownerLogin: null }
	const gist = (await response.json()) as GistPayload
	const ownerLogin =
		typeof gist.owner?.login === 'string' && gist.owner.login.length > 0
			? gist.owner.login
			: null
	return {
		entries: parseCatalogFromGist(gist),
		ownerLogin,
	}
}

/** Fetch catalog entries from the shared public gist. */
export async function fetchCatalog(
	_token?: string,
	_gistId?: string,
): Promise<CatalogEntry[]> {
	const snapshot = await fetchSharedCatalogSnapshot()
	return snapshot.entries
}

/** Save catalog entries to the configured shared gist. */
export async function saveCatalog(
	token: string,
	_gistId: string | null | undefined,
	entries: CatalogEntry[],
): Promise<void> {
	if (sharedCatalogTestSnapshot) {
		sharedCatalogTestSnapshot = {
			entries: cloneCatalogEntries(entries),
			ownerLogin: sharedCatalogTestSnapshot.ownerLogin,
		}
		return
	}

	const gistId = getSharedCatalogGistId()
	if (!gistId) {
		throw new Error('Shared catalog gist is not configured')
	}

	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify(buildCatalogGistPatch(entries)),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error updating shared catalog gist: ${response.status}`,
		)
	}
}
