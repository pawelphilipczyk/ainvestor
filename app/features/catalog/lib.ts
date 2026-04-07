import {
	ETF_TYPES,
	type EtfType,
	formatEtfTypeLabel,
} from '../../lib/guidelines.ts'

export const CATALOG_FILENAME = 'catalog.json'
const GITHUB_API = 'https://api.github.com'
const GITHUB_REQUEST_TIMEOUT_MS = 5_000

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

/** Normalize ticker for comparisons (spaces vs `+`, case). */
export function normalizeCatalogTickerLookupKey(raw: string): string {
	return raw.trim().replace(/\s+/g, '+').toUpperCase()
}

/** Lookup by ticker (case-insensitive). */
export function findCatalogEntryByTicker(
	catalog: CatalogEntry[],
	ticker: string,
): CatalogEntry | undefined {
	const normalisedTicker = normalizeCatalogTickerLookupKey(ticker)
	if (!normalisedTicker) return undefined
	return catalog.find(
		(entry) =>
			normalizeCatalogTickerLookupKey(entry.ticker) === normalisedTicker,
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
	/** Trading venue / MIC-style token when the API exposes it (disambiguates same ISIN on multiple markets). */
	market?: string
	exchange?: string
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

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

function normalizeIsinForCatalogId(raw: string | undefined): string | null {
	if (raw === undefined) return null
	const normalised = raw.trim().toUpperCase()
	if (!ISIN_PATTERN.test(normalised)) return null
	return normalised
}

/** Bloomberg-style suffix: last segment when it looks like an exchange mnemonic (e.g. `XMOV GR` → `GR`). */
function exchangeSuffixFromTicker(tickerUpper: string): string | null {
	const parts = tickerUpper.split(/\s+/).filter((part) => part.length > 0)
	if (parts.length < 2) return null
	const last = parts[parts.length - 1] ?? ''
	if (!/^[A-Z]{2,4}$/.test(last)) return null
	return last
}

function normalizeMarketTokenFromFields(
	market?: string,
	exchange?: string,
): string | null {
	const raw = (market ?? exchange ?? '').trim().toUpperCase()
	if (raw.length === 0) return null
	const cleaned = raw.replace(/[^A-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
	if (cleaned.length === 0) return null
	return cleaned.length > 16 ? cleaned.slice(0, 16) : cleaned
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

/** Per-row problems detected while reading bank JSON (formatted in the catalog controller). */
export type BankJsonImportRowIssue =
	| { kind: 'rowNotObject' }
	| { kind: 'missingTicker' }
	| { kind: 'missingFundName' }
	| { kind: 'isinInvalid' }
	| { kind: 'duplicateIdInPaste'; id: string; otherIndex: number }
	| { kind: 'duplicateMergeKeyInPaste'; otherIndex: number }
	| { kind: 'alreadyInCatalog' }
	| { kind: 'idAlreadyInCatalog'; id: string }

export type BankJsonImportRowDiagnostics = {
	/** 1-based index in the pasted `data` array. */
	index: number
	/** Short label for the row (ticker or fund name snippet). */
	label: string
	issues: BankJsonImportRowIssue[]
}

export type BankJsonParseForImportResult = {
	entries: CatalogEntry[]
	/**
	 * Rows that were not merged (invalid shape, missing fields, invalid ISIN, or
	 * duplicate id / duplicate merge key within the same paste).
	 */
	skippedRowDiagnostics: BankJsonImportRowDiagnostics[]
	/**
	 * Rows that were merged but had informational notes (e.g. refreshed existing
	 * catalog line or reused an existing id).
	 */
	noteRowDiagnostics: BankJsonImportRowDiagnostics[]
	/** Count of elements in `data` when it is an array; otherwise 0. */
	expectedDataRows: number
	/** Elements that were not objects (each counts as a skipped row with an issue). */
	skippedNonObjectCount: number
	/** Set when the JSON is not `{ data: array }` as expected (no per-row pass). */
	structuralIssue: 'notObject' | 'dataNotArray' | null
}

function rowLabelFromItem(item: BankEtfItem): string {
	const ticker = (item.ticker ?? '').trim()
	const name = (item.fund_name ?? '').trim()
	if (ticker && name) return `${ticker} — ${name}`
	if (ticker) return ticker
	if (name) return name.slice(0, 80)
	return '(no ticker or name)'
}

function isCatalogMergeNoteIssue(issue: BankJsonImportRowIssue): boolean {
	return (
		issue.kind === 'alreadyInCatalog' || issue.kind === 'idAlreadyInCatalog'
	)
}

/**
 * Parse bank JSON for catalog import with per-row diagnostics.
 * Valid rows are returned in `entries` even when other rows fail; callers merge
 * `entries` and surface `skippedRowDiagnostics` / `noteRowDiagnostics` in the UI.
 */
export function parseBankJsonForImport(
	json: unknown,
	existingCatalog: CatalogEntry[],
): BankJsonParseForImportResult {
	const empty = (
		expectedDataRows: number,
		structuralIssue: BankJsonParseForImportResult['structuralIssue'],
	): BankJsonParseForImportResult => ({
		entries: [],
		skippedRowDiagnostics: [],
		noteRowDiagnostics: [],
		expectedDataRows,
		skippedNonObjectCount: 0,
		structuralIssue,
	})

	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		return empty(0, 'notObject')
	}
	const payload = json as Record<string, unknown>
	const data = payload.data
	if (!Array.isArray(data)) {
		return empty(0, 'dataNotArray')
	}

	type ValidCandidate = {
		item: BankEtfItem
		dataIndex: number
		entry: CatalogEntry
	}

	const skippedRowDiagnostics: BankJsonImportRowDiagnostics[] = []
	let skippedNonObjectCount = 0
	const candidates: ValidCandidate[] = []

	for (let index = 0; index < data.length; index++) {
		const element = data[index]
		const dataIndex = index + 1
		if (!element || typeof element !== 'object' || Array.isArray(element)) {
			skippedNonObjectCount += 1
			skippedRowDiagnostics.push({
				index: dataIndex,
				label: '(invalid row)',
				issues: [{ kind: 'rowNotObject' }],
			})
			continue
		}

		const item = element as BankEtfItem
		const issues: BankJsonImportRowIssue[] = []
		const ticker = (item.ticker ?? '').trim()
		const name = (item.fund_name ?? '').trim()
		if (!ticker) issues.push({ kind: 'missingTicker' })
		if (!name) issues.push({ kind: 'missingFundName' })

		const rawIsin = item.isin
		const isinTrimmed = rawIsin === undefined ? '' : String(rawIsin).trim()
		if (isinTrimmed.length > 0 && normalizeIsinForCatalogId(rawIsin) === null) {
			issues.push({ kind: 'isinInvalid' })
		}

		if (issues.length > 0) {
			skippedRowDiagnostics.push({
				index: dataIndex,
				label: rowLabelFromItem(item),
				issues,
			})
			continue
		}

		const tickerUpper = ticker.toUpperCase()
		const tickerKey = normalizeCatalogTickerLookupKey(tickerUpper)
		const isinNorm = normalizeIsinForCatalogId(item.isin)
		const marketFromFields = normalizeMarketTokenFromFields(
			item.market,
			item.exchange,
		)
		const marketToken =
			marketFromFields ?? exchangeSuffixFromTicker(tickerUpper) ?? null
		const type = normaliseTypeFromBank(item.assets ?? '', item.sector ?? '')
		const description = (item.description ?? '').trim()

		let id: string
		const explicitId = (item.id ?? '').trim()
		if (explicitId.length > 0) {
			id = explicitId
		} else if (isinNorm !== null) {
			const qualifier = marketToken ?? tickerKey
			id = `${isinNorm}:${qualifier}`
		} else {
			id = `t:${tickerKey}`
		}

		const entry: CatalogEntry = {
			id,
			ticker: tickerUpper,
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

		candidates.push({ item, dataIndex, entry })
	}

	const idToIndices = new Map<string, number[]>()
	const mergeKeyToIndices = new Map<string, number[]>()
	for (const candidate of candidates) {
		const mergeKey = catalogMergeKey(candidate.entry)
		const idList = idToIndices.get(candidate.entry.id) ?? []
		idList.push(candidate.dataIndex)
		idToIndices.set(candidate.entry.id, idList)

		const keyList = mergeKeyToIndices.get(mergeKey) ?? []
		keyList.push(candidate.dataIndex)
		mergeKeyToIndices.set(mergeKey, keyList)
	}

	const existingIds = new Set(existingCatalog.map((row) => row.id))
	const existingMergeKeys = new Set(
		existingCatalog.map((row) => catalogMergeKey(row)),
	)

	const entries: CatalogEntry[] = []
	const noteRowDiagnostics: BankJsonImportRowDiagnostics[] = []
	for (const candidate of candidates) {
		const { item, dataIndex, entry } = candidate
		const mergeKey = catalogMergeKey(entry)
		const issues: BankJsonImportRowIssue[] = []

		const idIndices = idToIndices.get(entry.id) ?? []
		if (idIndices.length > 1) {
			const firstIdIndex = Math.min(...idIndices)
			if (dataIndex !== firstIdIndex) {
				issues.push({
					kind: 'duplicateIdInPaste',
					id: entry.id,
					otherIndex: firstIdIndex,
				})
			}
		}

		const keyIndices = mergeKeyToIndices.get(mergeKey) ?? []
		if (keyIndices.length > 1) {
			const firstKeyIndex = Math.min(...keyIndices)
			if (dataIndex !== firstKeyIndex) {
				issues.push({
					kind: 'duplicateMergeKeyInPaste',
					otherIndex: firstKeyIndex,
				})
			}
		}

		if (existingIds.has(entry.id)) {
			issues.push({ kind: 'idAlreadyInCatalog', id: entry.id })
		}
		if (existingMergeKeys.has(mergeKey)) {
			issues.push({ kind: 'alreadyInCatalog' })
		}

		const blockingIssues = issues.filter(
			(issue) => !isCatalogMergeNoteIssue(issue),
		)
		const noteIssues = issues.filter(isCatalogMergeNoteIssue)

		if (blockingIssues.length > 0) {
			skippedRowDiagnostics.push({
				index: dataIndex,
				label: rowLabelFromItem(item),
				issues,
			})
			continue
		}

		entries.push(entry)
		if (noteIssues.length > 0) {
			noteRowDiagnostics.push({
				index: dataIndex,
				label: rowLabelFromItem(item),
				issues: noteIssues,
			})
		}
	}

	skippedRowDiagnostics.sort((a, b) => a.index - b.index)
	noteRowDiagnostics.sort((a, b) => a.index - b.index)

	return {
		entries,
		skippedRowDiagnostics,
		noteRowDiagnostics,
		expectedDataRows: data.length,
		skippedNonObjectCount,
		structuralIssue: null,
	}
}

/**
 * Parse bank/investment website fetch response JSON into CatalogEntry array.
 * Extracts only investment-relevant fields. Duplicate rows collapse when merged
 * (see {@link mergeBankIntoCatalog}).
 *
 * For import UX with per-row error detail, use {@link parseBankJsonForImport} instead.
 */
export function parseBankJsonToCatalog(json: unknown): CatalogEntry[] {
	return parseBankJsonForImport(json, []).entries
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

	try {
		const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
			signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
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
	} catch (error) {
		console.error('[catalog] Shared catalog fetch failed', error)
		return { entries: [], ownerLogin: null }
	}
}

/** Fetch catalog entries from the shared public gist. */
export async function fetchCatalog(): Promise<CatalogEntry[]> {
	const snapshot = await fetchSharedCatalogSnapshot()
	return snapshot.entries
}

/** Save catalog entries to the configured shared gist. */
export async function saveCatalog(params: {
	token: string
	entries: CatalogEntry[]
}): Promise<void> {
	const { token, entries } = params
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
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(token),
		body: JSON.stringify(buildCatalogGistPatch(entries)),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error updating shared catalog gist: ${response.status}`,
		)
	}
}
