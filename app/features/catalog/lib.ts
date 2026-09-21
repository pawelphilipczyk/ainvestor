import {
	ETF_TYPES,
	type EtfType,
	formatEtfTypeLabel,
	GUIDELINE_ETF_TYPES,
} from '../../lib/guidelines.ts'

export const CATALOG_FILENAME = 'catalog.json'
/**
 * Every bank row as received, keyed by catalog id, in the same gist as the
 * catalog. Kept so a field the catalog derives (like `type`) can be re-derived
 * from the source by re-running code, not by re-capturing the bank's screener.
 * Only the import reads it; catalog reads ignore it.
 */
export const CATALOG_SOURCE_FILENAME = 'catalog-source.json'
const GITHUB_API = 'https://api.github.com'
const GITHUB_REQUEST_TIMEOUT_MS = 5_000
/** In-process TTL for {@link fetchSharedCatalogSnapshot} (ms). Override with `SHARED_CATALOG_CACHE_TTL_MS`; use `0` to disable. */
const DEFAULT_SHARED_CATALOG_CACHE_TTL_MS = 60_000

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
	/** Bank's asset class for the fund (e.g. "akcje", "surowce") — what `type` is derived from. */
	assets?: string
	/** Bank's narrower subject, set on few rows (e.g. "Srebro"). */
	investment_subject?: string
	/** Bank's free-form tags (e.g. ["akcje", "AI/robotyka"]). Not reliable for classification. */
	tags?: string[]
	/** Trading venue (e.g. "GBR-LSE"). */
	market?: string
	/** Trading currency of this listing. */
	currency?: string
	/** Base currency of the fund. */
	fund_currency?: string
	/** "fizyczna" / "syntetyczna". */
	replication?: string
	/** "akumulujący" / "dystrybuujący". */
	distribution?: string
	/** Fund domicile (e.g. "Irlandia"). */
	country?: string
}

/** Coarse risk bands for catalog filter and table display (from `risk_kid` when present). */
export const CATALOG_RISK_BAND_VALUES = ['low', 'medium', 'high'] as const
export type CatalogRiskBand = (typeof CATALOG_RISK_BAND_VALUES)[number]

/** PRIIPs KID risk is an integer scale from 1 (lowest) to 7 (highest). */
export function isValidRiskKid(value: number): boolean {
	return Number.isInteger(value) && value >= 1 && value <= 7
}

/**
 * Maps numeric `risk_kid` to low / medium / high. Non-integer or out-of-range values yield `undefined`.
 */
export function riskBandFromRiskKid(
	riskKid: number | undefined,
): CatalogRiskBand | undefined {
	if (typeof riskKid !== 'number' || !isValidRiskKid(riskKid)) return undefined
	if (riskKid <= 2) return 'low'
	if (riskKid <= 4) return 'medium'
	return 'high'
}

const CATALOG_RISK_BAND_SET = new Set<string>(CATALOG_RISK_BAND_VALUES)

/** Normalizes a query param to a known risk band, or empty string when absent or invalid. */
export function parseCatalogRiskFilterParam(
	raw: string | null,
): '' | CatalogRiskBand {
	if (raw === null) return ''
	const trimmed = raw.trim().toLowerCase()
	if (trimmed.length === 0) return ''
	return CATALOG_RISK_BAND_SET.has(trimmed) ? (trimmed as CatalogRiskBand) : ''
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
 * Dropdown options for asset-class guidelines: types that appear in the catalog,
 * minus `unknown` (a catalog to-do, not a class to target). When that leaves
 * nothing, falls back to every guideline type so the form still works.
 */
export function assetClassSelectOptionsFromCatalog(
	catalog: CatalogEntry[],
): { value: EtfType; label: string }[] {
	const types = uniqueEtfTypesFromCatalog(catalog).filter(
		(etfType) => etfType !== 'unknown',
	)
	const ordered = types.length > 0 ? types : [...GUIDELINE_ETF_TYPES]
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
/**
 * Free-text match over ticker, name and description — the catalog list's own
 * search rule, shared so the UI and any other caller cannot disagree about what
 * a query matches. An empty query matches everything.
 */
export function catalogEntryMatchesQuery(
	entry: CatalogEntry,
	query: string,
): boolean {
	const needle = query.trim().toLowerCase()
	if (needle.length === 0) return true
	return (
		entry.ticker.toLowerCase().includes(needle) ||
		entry.name.toLowerCase().includes(needle) ||
		entry.description.toLowerCase().includes(needle)
	)
}

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
	investment_subject?: string | null
	tags?: unknown
	currency?: string | null
	fund_currency?: string | null
	replication?: string | null
	distribution?: string | null
	country?: string | null
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

/**
 * The catalog's id rule, in one place: an explicit id wins, otherwise a valid
 * ISIN plus the trading venue (so one fund listed on two exchanges keeps two
 * rows), otherwise the ticker alone.
 *
 * Shared by the bank import and by any other writer, so a row added by hand
 * lands on the same id the next import would compute for it — and updates that
 * row instead of doubling it.
 */
export function deriveCatalogEntryId(params: {
	ticker: string
	explicitId?: string | undefined
	isin?: string | undefined
	market?: string | undefined
	exchange?: string | undefined
}): string {
	const { ticker, explicitId, isin, market, exchange } = params
	const trimmedExplicitId = (explicitId ?? '').trim()
	if (trimmedExplicitId.length > 0) return trimmedExplicitId

	const tickerUpper = ticker.trim().toUpperCase()
	const tickerKey = normalizeCatalogTickerLookupKey(tickerUpper)
	const isinNormalised = normalizeIsinForCatalogId(isin)
	if (isinNormalised === null) return `t:${tickerKey}`

	const marketToken =
		normalizeMarketTokenFromFields(market, exchange) ??
		exchangeSuffixFromTicker(tickerUpper) ??
		tickerKey
	return `${isinNormalised}:${marketToken}`
}

export type CatalogEntryValidationIssue =
	| 'missingTicker'
	| 'missingName'
	| 'isinInvalid'
	| 'riskKidOutOfRange'

/**
 * The one check every write path runs a fully-built row through, whatever put
 * it together — a bank export or one explicit field from an MCP call. Bank
 * data is external input too; it does not get to skip a check a hand-typed row
 * would have to pass.
 *
 * Takes the finished `CatalogEntry`, not the raw source fields, so a caller
 * that only changes one field and carries the rest forward from the existing
 * row (an upsert) is validated the same way as a caller that builds the whole
 * row from scratch (an import) — both end up checking the same, complete shape.
 */
export function validateCatalogEntry(
	entry: CatalogEntry,
): CatalogEntryValidationIssue[] {
	const issues: CatalogEntryValidationIssue[] = []
	if (entry.ticker.trim().length === 0) issues.push('missingTicker')
	if (entry.name.trim().length === 0) issues.push('missingName')
	if (
		entry.isin !== undefined &&
		normalizeIsinForCatalogId(entry.isin) === null
	) {
		issues.push('isinInvalid')
	}
	if (entry.risk_kid !== undefined && !isValidRiskKid(entry.risk_kid)) {
		issues.push('riskKidOutOfRange')
	}
	return issues
}

/**
 * What a fund *is*, from the bank's `assets` field — never from `sector`, which
 * says what the fund invests in: a gold-miners equity fund carries sector
 * "surowce i towary", physical gold carries sector "metale". `sector` only
 * narrows a class `assets` already decided.
 *
 * Anything `assets` does not name (missing, empty, "kryptowaluty") is
 * `unknown` and surfaces in the import report, rather than being guessed.
 */
export function deriveEtfTypeFromBank(params: {
	assets: string | null | undefined
	sector: string | null | undefined
}): EtfType {
	const assets = (params.assets ?? '').trim().toLowerCase()
	const sector = (params.sector ?? '').trim().toLowerCase()
	switch (assets) {
		case 'akcje':
			return sector.includes('nieruchomo') ? 'real_estate' : 'equity'
		case 'obligacje':
			return sector.includes('rynek pieni') ? 'money_market' : 'bond'
		case 'surowce':
			return 'commodity'
		case 'mieszany':
			return 'mixed'
		default:
			return 'unknown'
	}
}

function nonEmptyString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : undefined
}

/** The bank sends tags as `[{ tag: "akcje" }, …]`. */
function tagsFromBank(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined
	const tags = value
		.map((item) =>
			item && typeof item === 'object'
				? nonEmptyString((item as Record<string, unknown>).tag)
				: undefined,
		)
		.filter((tag): tag is string => tag !== undefined)
	return tags.length > 0 ? tags : undefined
}

/** Optional string fields copied verbatim from the bank row when non-empty. */
const BANK_PASSTHROUGH_STRING_FIELDS = [
	'assets',
	'investment_subject',
	'market',
	'currency',
	'fund_currency',
	'replication',
	'distribution',
	'country',
] as const satisfies readonly (keyof CatalogEntry & keyof BankEtfItem)[]

/**
 * Optional fields the bank import owns. A re-import clears any of them the
 * bank no longer sends, so a stored row never mixes this import's values with
 * a previous import's (e.g. an old `assets` next to a `type` derived without
 * it). `isin` is left out: it is part of the merge key.
 */
const BANK_OWNED_OPTIONAL_FIELDS = [
	...BANK_PASSTHROUGH_STRING_FIELDS,
	'tags',
	'expense_ratio',
	'risk_kid',
	'region',
	'sector',
	'rate_of_return',
	'volatility',
	'return_risk',
	'fund_size',
	'esg',
] as const satisfies readonly (keyof CatalogEntry)[]

/** Per-row problems detected while reading bank JSON (formatted in the catalog controller). */
export type BankJsonImportRowIssue =
	| { kind: 'rowNotObject' }
	| { kind: 'missingTicker' }
	| { kind: 'missingFundName' }
	| { kind: 'isinInvalid' }
	| { kind: 'riskKidOutOfRange' }
	| { kind: 'duplicateIdInPaste'; id: string; otherIndex: number }
	| { kind: 'duplicateMergeKeyInPaste'; otherIndex: number }
	| { kind: 'alreadyInCatalog' }
	| { kind: 'idAlreadyInCatalog'; id: string }

/** A row whose derived type differs from the catalog row it updates. */
export type BankJsonImportTypeChange = {
	label: string
	from: EtfType
	to: EtfType
}

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
	/** Imported rows typed `unknown` — `assets` named no class; they need a type set by hand. */
	unclassifiedRows: { index: number; label: string }[]
	/** Imported rows that update an existing catalog row with a different type. */
	typeChanges: BankJsonImportTypeChange[]
	/**
	 * Every imported row exactly as the bank sent it, keyed by the catalog id it
	 * lands on after merging — see {@link CATALOG_SOURCE_FILENAME}.
	 */
	sourceRowsById: Record<string, unknown>
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

/** validateCatalogEntry's generic issues, worded for the bank-import diagnostics UI. */
function bankJsonImportIssueFor(
	issue: CatalogEntryValidationIssue,
): BankJsonImportRowIssue {
	switch (issue) {
		case 'missingTicker':
			return { kind: 'missingTicker' }
		case 'missingName':
			return { kind: 'missingFundName' }
		case 'isinInvalid':
			return { kind: 'isinInvalid' }
		case 'riskKidOutOfRange':
			return { kind: 'riskKidOutOfRange' }
	}
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
		unclassifiedRows: [],
		typeChanges: [],
		sourceRowsById: {},
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
		const tickerUpper = (item.ticker ?? '').trim().toUpperCase()
		const name = (item.fund_name ?? '').trim()
		const type = deriveEtfTypeFromBank({
			assets: item.assets,
			sector: item.sector,
		})
		const description = (item.description ?? '').trim()

		const id = deriveCatalogEntryId({
			ticker: tickerUpper,
			explicitId: item.id,
			isin: item.isin,
			market: item.market,
			exchange: item.exchange,
		})

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
		for (const field of BANK_PASSTHROUGH_STRING_FIELDS) {
			const value = nonEmptyString(item[field])
			if (value !== undefined) entry[field] = value
		}
		const tags = tagsFromBank(item.tags)
		if (tags !== undefined) entry.tags = tags

		// Validate the row this import would actually write, the same way any
		// other write path has to — see validateCatalogEntry.
		const validationIssues = validateCatalogEntry(entry)
		if (validationIssues.length > 0) {
			skippedRowDiagnostics.push({
				index: dataIndex,
				label: rowLabelFromItem(item),
				issues: validationIssues.map(bankJsonImportIssueFor),
			})
			continue
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
	const existingByMergeKey = new Map(
		existingCatalog.map((row) => [catalogMergeKey(row), row]),
	)

	const entries: CatalogEntry[] = []
	const noteRowDiagnostics: BankJsonImportRowDiagnostics[] = []
	const unclassifiedRows: BankJsonParseForImportResult['unclassifiedRows'] = []
	const typeChanges: BankJsonImportTypeChange[] = []
	const sourceRowsById: Record<string, unknown> = {}
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
		const existingRow = existingByMergeKey.get(mergeKey)
		if (existingRow !== undefined) {
			issues.push({ kind: 'alreadyInCatalog' })
			// The bank still names no class, but someone already gave this row
			// one by hand — the import has nothing better to offer, so keep it.
			if (entry.type === 'unknown' && existingRow.type !== 'unknown') {
				entry.type = existingRow.type
			}
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
		// mergeBankIntoCatalog keeps the existing row's id, so key the source
		// row by that — the id the merged catalog will actually carry.
		sourceRowsById[existingRow?.id ?? entry.id] = item
		if (entry.type === 'unknown') {
			unclassifiedRows.push({ index: dataIndex, label: rowLabelFromItem(item) })
		}
		if (existingRow !== undefined && existingRow.type !== entry.type) {
			typeChanges.push({
				label: rowLabelFromItem(item),
				from: existingRow.type,
				to: entry.type,
			})
		}
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
		unclassifiedRows,
		typeChanges,
		sourceRowsById,
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

/** Like {@link mergeCatalogRow}, but bank-owned fields the import omits are cleared. */
function mergeImportedRow(
	existingRow: CatalogEntry,
	incomingRow: CatalogEntry,
): CatalogEntry {
	const bankOwned = new Set<string>(BANK_OWNED_OPTIONAL_FIELDS)
	const base = Object.fromEntries(
		Object.entries(existingRow).filter(([field]) => !bankOwned.has(field)),
	) as CatalogEntry
	return mergeCatalogRow(base, incomingRow)
}

/**
 * Merge imported rows into the catalog. Rows with the same merge key (same ISIN
 * and same normalised ticker when ISIN is present) update the existing row
 * (incoming fields win, bank-owned fields the import omits are cleared; `id`
 * is kept from the first).
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
			existingAtKey ? mergeImportedRow(existingAtKey, entry) : entry,
		)
	}
	return [...byKey.values()]
}

// ---------------------------------------------------------------------------
// Gist helpers
// ---------------------------------------------------------------------------

type GistFile = {
	content: string | null
	/** The gist API cuts file content off at 1 MB; the full file is at `raw_url`. */
	truncated?: boolean
	raw_url?: string
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

/**
 * Build a PATCH-ready body to update the catalog file in a gist — and, when
 * given, the source rows file alongside it in the same request. The source
 * file is compact JSON: it is large and read by code, not by people.
 */
export function buildCatalogGistPatch(
	entries: CatalogEntry[],
	sourceRowsById?: Record<string, unknown>,
): {
	files: Record<string, { content: string }>
} {
	return {
		files: {
			[CATALOG_FILENAME]: {
				content: JSON.stringify(entries, null, 2),
			},
			...(sourceRowsById !== undefined
				? {
						[CATALOG_SOURCE_FILENAME]: {
							content: JSON.stringify(sourceRowsById),
						},
					}
				: {}),
		},
	}
}

let sharedCatalogTestSnapshot: SharedCatalogSnapshot | null = null
let sharedCatalogTestSourceRows: Record<string, unknown> = {}

let sharedCatalogTtlCache: {
	gistId: string
	snapshot: SharedCatalogSnapshot
	expiresAt: number
} | null = null

function getSharedCatalogCacheTtlMs(): number {
	const raw = (process.env.SHARED_CATALOG_CACHE_TTL_MS ?? '').trim()
	if (raw.length === 0) return DEFAULT_SHARED_CATALOG_CACHE_TTL_MS
	const parsed = Number.parseInt(raw, 10)
	if (!Number.isFinite(parsed) || parsed < 0) {
		return DEFAULT_SHARED_CATALOG_CACHE_TTL_MS
	}
	return parsed
}

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
	sharedCatalogTtlCache = null
	sharedCatalogTestSnapshot = cloneSharedCatalogSnapshot(snapshot)
	sharedCatalogTestSourceRows = {}
}

export function resetSharedCatalogForTests(): void {
	sharedCatalogTestSnapshot = null
	sharedCatalogTestSourceRows = {}
	sharedCatalogTtlCache = null
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

	const ttlMs = getSharedCatalogCacheTtlMs()
	const cached = sharedCatalogTtlCache
	if (
		ttlMs > 0 &&
		cached !== null &&
		cached.gistId === gistId &&
		Date.now() < cached.expiresAt
	) {
		return cloneSharedCatalogSnapshot(cached.snapshot)
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
		const snapshot: SharedCatalogSnapshot = {
			entries: parseCatalogFromGist(gist),
			ownerLogin,
		}
		if (ttlMs > 0) {
			sharedCatalogTtlCache = {
				gistId,
				snapshot: cloneSharedCatalogSnapshot(snapshot),
				expiresAt: Date.now() + ttlMs,
			}
		}
		return cloneSharedCatalogSnapshot(snapshot)
	} catch (error) {
		console.error('[catalog] Shared catalog fetch failed', error)
		return { entries: [], ownerLogin: null }
	}
}

/**
 * Read the stored source rows (see {@link CATALOG_SOURCE_FILENAME}), uncached.
 * An absent file is an empty record. Throws when the file exists but cannot be
 * read or parsed, so an import never overwrites history it failed to load.
 */
export async function fetchCatalogSourceRows(): Promise<
	Record<string, unknown>
> {
	if (sharedCatalogTestSnapshot) {
		return { ...sharedCatalogTestSourceRows }
	}

	const gistId = getSharedCatalogGistId()
	if (!gistId) return {}

	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: {
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		},
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error reading catalog source rows: ${response.status}`,
		)
	}
	const gist = (await response.json()) as GistPayload
	const file = gist.files[CATALOG_SOURCE_FILENAME]
	if (!file) return {}

	let content = file.content
	if ((file.truncated === true || content === null) && file.raw_url) {
		const rawResponse = await fetch(file.raw_url, {
			signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		})
		if (!rawResponse.ok) {
			throw new Error(
				`Could not download catalog source rows: ${rawResponse.status}`,
			)
		}
		content = await rawResponse.text()
	}
	if (content === null || content.trim().length === 0) return {}

	const parsed: unknown = JSON.parse(content)
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${CATALOG_SOURCE_FILENAME} is not a JSON object`)
	}
	return parsed as Record<string, unknown>
}

/**
 * Save a bank import: the merged catalog plus this import's source rows added
 * to those stored by earlier imports (a fund re-imported replaces its row).
 * Shared by the web import card and the MCP import tool.
 */
export async function saveCatalogImport(params: {
	token: string
	mergedEntries: CatalogEntry[]
	sourceRowsById: Record<string, unknown>
}): Promise<void> {
	const storedSourceRows = await fetchCatalogSourceRows()
	await saveCatalog({
		token: params.token,
		entries: params.mergedEntries,
		sourceRowsById: { ...storedSourceRows, ...params.sourceRowsById },
	})
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
	/** The complete source-rows record to store; omitted leaves that file as it is. */
	sourceRowsById?: Record<string, unknown>
}): Promise<void> {
	const { token, entries, sourceRowsById } = params
	if (sharedCatalogTestSnapshot) {
		sharedCatalogTestSnapshot = {
			entries: cloneCatalogEntries(entries),
			ownerLogin: sharedCatalogTestSnapshot.ownerLogin,
		}
		if (sourceRowsById !== undefined) {
			sharedCatalogTestSourceRows = { ...sourceRowsById }
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
		body: JSON.stringify(buildCatalogGistPatch(entries, sourceRowsById)),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error updating shared catalog gist: ${response.status}`,
		)
	}

	// A write must be visible to the very next read, in this process and in
	// every other reader sharing it (UI and the MCP HTTP transport both call
	// fetchCatalog/fetchSharedCatalogSnapshot from this module) — otherwise a
	// stale snapshot can keep serving for up to the TTL after a save.
	sharedCatalogTtlCache = null
}
