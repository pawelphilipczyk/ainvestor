import {
	ETF_TYPES,
	type EtfType,
	formatEtfTypeLabel,
	GUIDELINE_ETF_TYPES,
} from '../../lib/guidelines.ts'
import {
	type CommitSource,
	commitMessage,
} from '../../lib/store/commit-message.ts'
import {
	getRepoAccess,
	readFile,
	readHeadCommit,
	writeFiles,
} from '../../lib/store/github-repo-store.ts'
import {
	type ChangeOutcome,
	readModifyWrite,
	WriteConflictError,
} from '../../lib/store/read-modify-write.ts'

export const CATALOG_FILENAME = 'catalog.json'
/**
 * Every bank row as received, keyed by catalog id, in the same repo as the
 * catalog. Kept so a field the catalog derives (like `type`) can be re-derived
 * from the source by re-running code, not by re-capturing the bank's screener.
 * Only the import reads it; catalog reads ignore it.
 */
export const CATALOG_SOURCE_FILENAME = 'catalog-source.json'
/**
 * The shared catalog's repo: private, in the `ainvestor-shared` organization,
 * readable by the `ainvestor-users` team (see "Why an organization for the
 * catalog" in `docs/STORAGE_MIGRATION_PLAN.md`). One catalog serves preview and
 * prod alike. `SHARED_CATALOG_REPO` (`owner/repo`) points elsewhere, for a fork
 * or a test.
 */
export const DEFAULT_SHARED_CATALOG_REPO = 'ainvestor-shared/ainvestor-catalog'

export function getSharedCatalogRepo(
	env: NodeJS.ProcessEnv = process.env,
): string {
	const configured = (env.SHARED_CATALOG_REPO ?? '').trim()
	return configured.length > 0 ? configured : DEFAULT_SHARED_CATALOG_REPO
}

/** In-process TTL for {@link fetchSharedCatalogSnapshot} (ms). Override with `SHARED_CATALOG_CACHE_TTL_MS`; use `0` to disable. */
const DEFAULT_SHARED_CATALOG_CACHE_TTL_MS = 60_000
/** How long a stale snapshot is served before the next refresh attempt (ms). */
const STALE_RETRY_MS = 15_000

export type SharedCatalogSnapshot = {
	entries: CatalogEntry[]
	/**
	 * Why `entries` is empty when it is not really: `no-access` when GitHub will
	 * not show this token the private repo, `unavailable` when it could not be
	 * read and no earlier copy was at hand. Absent on a good read.
	 */
	problem?: 'no-access' | 'unavailable'
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
// Stored-file helpers
// ---------------------------------------------------------------------------

/**
 * Parse catalog entries from the text of `catalog.json`; `null` when the file
 * does not exist. The caller reads through `readFile` in
 * `app/lib/store/github-repo-store.ts`, which owns the raw wire shape, so only
 * text reaches this function.
 */
export function parseCatalogFromFile(content: string | null): CatalogEntry[] {
	if (!content) return []
	try {
		const parsed = JSON.parse(content)
		return Array.isArray(parsed) ? (parsed as CatalogEntry[]) : []
	} catch {
		return []
	}
}

/**
 * The file texts a catalog save writes, by path: the catalog — and, when given,
 * the source rows file alongside it in the same commit. The source file is
 * compact JSON: it is large and read by code, not by people.
 */
export function buildCatalogFiles(
	entries: CatalogEntry[],
	sourceRowsById?: Record<string, unknown>,
): Record<string, string> {
	return {
		[CATALOG_FILENAME]: JSON.stringify(entries, null, 2),
		...(sourceRowsById !== undefined
			? { [CATALOG_SOURCE_FILENAME]: JSON.stringify(sourceRowsById) }
			: {}),
	}
}

let sharedCatalogTestSnapshot: SharedCatalogSnapshot | null = null
let sharedCatalogTestSourceRows: Record<string, unknown> = {}
let sharedCatalogTestCanWrite = true

/** Bounds the per-token cache; only approved users reach it, and they are few. */
const MAX_CACHED_TOKENS = 50

/**
 * The last good snapshot per token. Keyed by token, not shared: the repo is
 * private, so a copy read with one account's token must never be handed to
 * another account GitHub would not show it to — over MCP, any GitHub token can
 * call the read tools.
 */
const snapshotByToken = new Map<
	string,
	{ location: string; snapshot: SharedCatalogSnapshot; expiresAt: number }
>()

function rememberSnapshot(
	token: string,
	entry: {
		location: string
		snapshot: SharedCatalogSnapshot
		expiresAt: number
	},
): void {
	snapshotByToken.delete(token)
	snapshotByToken.set(token, entry)
	if (snapshotByToken.size > MAX_CACHED_TOKENS) {
		const oldest = snapshotByToken.keys().next().value
		if (oldest !== undefined) snapshotByToken.delete(oldest)
	}
}

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
		...(snapshot.problem !== undefined ? { problem: snapshot.problem } : {}),
	}
}

export function setSharedCatalogForTests(snapshot: {
	entries: CatalogEntry[]
}): void {
	snapshotByToken.clear()
	sharedCatalogTestSnapshot = { entries: cloneCatalogEntries(snapshot.entries) }
	sharedCatalogTestSourceRows = {}
}

/**
 * Test seam: an empty test catalog unless a test already set one, so a route
 * test that never mentions the catalog does not reach for the real private
 * repo with a fake token. Additive, like `ensurePrivateDataTestStore`.
 */
export function ensureSharedCatalogForTests(): void {
	if (sharedCatalogTestSnapshot === null) {
		setSharedCatalogForTests({ entries: [] })
	}
}

export function resetSharedCatalogForTests(): void {
	sharedCatalogTestSnapshot = null
	sharedCatalogTestSourceRows = {}
	sharedCatalogTestCanWrite = true
	snapshotByToken.clear()
}

/** Test seam: what {@link canWriteSharedCatalog} answers while a test catalog is set. */
export function setSharedCatalogWriteAccessForTests(canWrite: boolean): void {
	sharedCatalogTestCanWrite = canWrite
}

/**
 * Whether this token may change the shared catalog — the app's whole notion of
 * a catalog admin. It is GitHub's own answer (push access to the catalog repo,
 * granted by the organization), so the app keeps no list of admins. A token
 * that cannot see the repo at all (GitHub's 404 for a private repo) is simply
 * not an admin; any other GitHub failure throws, so a caller deciding at sign-in
 * can tell "no" from "could not ask".
 */
export async function canWriteSharedCatalog(token: string): Promise<boolean> {
	if (sharedCatalogTestSnapshot) return sharedCatalogTestCanWrite
	const access = await getRepoAccess({
		token,
		location: getSharedCatalogRepo(),
	})
	return access.found && access.canWrite
}

/** The catalog as a reader sees it, or why it could not be read. */
type CatalogRead =
	| { ok: true; entries: CatalogEntry[] }
	/** GitHub's 404: the token cannot see the repo, or catalog.json is missing. */
	| { ok: false; reason: 'no-access'; status: number }
	| { ok: false; reason: 'unavailable'; status: number }

async function readCatalogFile(params: {
	token: string
	location: string
}): Promise<CatalogRead> {
	const result = await readFile({ ...params, path: CATALOG_FILENAME })
	if (!result.ok) {
		return {
			ok: false,
			reason:
				result.status === 401 || result.status === 404
					? 'no-access'
					: 'unavailable',
			status: result.status,
		}
	}
	// GitHub answers 404 both for a missing file and for a private repo this
	// token cannot see. The catalog repo always holds catalog.json, so it is the
	// second case.
	if (result.file === null) {
		return { ok: false, reason: 'no-access', status: 404 }
	}
	return {
		ok: true,
		entries: parseCatalogFromFile(result.file.content),
	}
}

/**
 * The shared catalog as this token may see it, cached per token for a short
 * TTL.
 *
 * The repo is private, so it is read with the caller's own token: anonymous
 * reads cannot see it, and no server-side credential exists. Without a token
 * (signed out, or pending approval) there is nothing to read. A token GitHub
 * will not show the repo to gets an empty catalog marked `problem: 'no-access'`
 * — not an empty catalog that looks like nobody imported one.
 *
 * When a refresh fails for any other reason, the same token's last good
 * snapshot is served instead: the catalog changes rarely, and an empty one stops
 * every buy and sell, which need a ticker from it. The next attempt waits
 * {@link STALE_RETRY_MS} so a limited endpoint is not hit by every request.
 */
export async function fetchSharedCatalogSnapshot(
	token: string | null,
): Promise<SharedCatalogSnapshot> {
	if (sharedCatalogTestSnapshot) {
		return cloneSharedCatalogSnapshot(sharedCatalogTestSnapshot)
	}
	if (token === null) return { entries: [], problem: 'no-access' }

	const location = getSharedCatalogRepo()
	const ttlMs = getSharedCatalogCacheTtlMs()
	const cachedEntry = snapshotByToken.get(token)
	const cached =
		cachedEntry !== undefined && cachedEntry.location === location
			? cachedEntry
			: undefined
	if (ttlMs > 0 && cached !== undefined && Date.now() < cached.expiresAt) {
		return cloneSharedCatalogSnapshot(cached.snapshot)
	}

	let read: CatalogRead
	try {
		read = await readCatalogFile({ token, location })
	} catch (error) {
		console.error('[catalog] Shared catalog fetch failed', error)
		read = { ok: false, reason: 'unavailable', status: 0 }
	}

	if (read.ok) {
		const snapshot: SharedCatalogSnapshot = { entries: read.entries }
		if (ttlMs > 0) {
			rememberSnapshot(token, {
				location,
				snapshot: cloneSharedCatalogSnapshot(snapshot),
				expiresAt: Date.now() + ttlMs,
			})
		}
		return cloneSharedCatalogSnapshot(snapshot)
	}

	console.error(
		`[catalog] Shared catalog read failed: GitHub API error ${read.status} reading ${location}` +
			(read.reason === 'no-access'
				? ` (not visible to this token: is the account on the ainvestor-users team, and is this OAuth app approved for the organization? Or ${CATALOG_FILENAME} is missing.)`
				: ''),
	)
	if (read.reason === 'no-access') {
		// Access gone: this token keeps no copy of what it can no longer read.
		snapshotByToken.delete(token)
		return { entries: [], problem: 'no-access' }
	}
	if (ttlMs > 0 && cached !== undefined) {
		cached.expiresAt = Date.now() + STALE_RETRY_MS
		return cloneSharedCatalogSnapshot(cached.snapshot)
	}
	return { entries: [], problem: 'unavailable' }
}

/** Fetch catalog entries from the shared catalog repo; see {@link fetchSharedCatalogSnapshot} for `token`. */
export async function fetchCatalog(
	token: string | null,
): Promise<CatalogEntry[]> {
	const snapshot = await fetchSharedCatalogSnapshot(token)
	return snapshot.entries
}

/** What a catalog edit sees, and what it may write back. */
export type SharedCatalogContent = {
	entries: CatalogEntry[]
	/** Every bank row stored by earlier imports, by catalog id (see {@link CATALOG_SOURCE_FILENAME}). */
	sourceRowsById: Record<string, unknown>
}

async function readSourceRows(params: {
	token: string
	location: string
}): Promise<Record<string, unknown>> {
	const result = await readFile({ ...params, path: CATALOG_SOURCE_FILENAME })
	if (!result.ok) {
		throw new Error(
			`GitHub API error reading catalog source rows: ${result.status}`,
		)
	}
	if (!result.file) return {}
	const content = result.file.content
	if (content.trim().length === 0) return {}
	const parsed: unknown = JSON.parse(content)
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${CATALOG_SOURCE_FILENAME} is not a JSON object`)
	}
	return parsed as Record<string, unknown>
}

/**
 * Edit the shared catalog with compare-and-swap. Every edit replaces whole
 * files, so it is built from a fresh read — never the cached snapshot, which
 * can be a minute old or empty after a failed read — and that read fails
 * loudly: an edit built on an empty list would save a catalog of one fund.
 *
 * The head commit is read first and the save lands only on top of it, in one
 * commit with both files; when another client saved in between, `change` is
 * redone on the newer catalog, up to {@link MAX_WRITE_ATTEMPTS} times, then
 * {@link WriteConflictError}. GitHub refuses the save for a token without push
 * access. `change` runs once per attempt, so it must be free of side effects.
 */
export async function updateSharedCatalog<TResult>(params: {
	token: string
	change: (
		current: SharedCatalogContent,
	) => ChangeOutcome<
		{ entries: CatalogEntry[]; sourceRowsById?: Record<string, unknown> },
		TResult
	>
}): Promise<TResult> {
	const { token } = params
	if (sharedCatalogTestSnapshot) {
		const outcome = params.change({
			entries: cloneCatalogEntries(sharedCatalogTestSnapshot.entries),
			sourceRowsById: { ...sharedCatalogTestSourceRows },
		})
		if ('write' in outcome) {
			sharedCatalogTestSnapshot = {
				entries: cloneCatalogEntries(outcome.write.entries),
			}
			if (outcome.write.sourceRowsById !== undefined) {
				sharedCatalogTestSourceRows = { ...outcome.write.sourceRowsById }
			}
		}
		return outcome.result
	}

	const location = getSharedCatalogRepo()
	const result = await readModifyWrite({
		what: 'the shared catalog',
		read: async () => {
			const head = await readHeadCommit({ token, location })
			if (!head.ok) {
				throw new Error(`GitHub API error reading ${location}: ${head.status}`)
			}
			const read = await readCatalogFile({ token, location })
			if (!read.ok) {
				throw new Error(
					`GitHub API error reading the shared catalog: ${read.status}`,
				)
			}
			return {
				value: {
					entries: read.entries,
					sourceRowsById: await readSourceRows({ token, location }),
				},
				version: head.sha,
			}
		},
		change: params.change,
		write: async ({ value, version, message }) => {
			const saved = await writeFiles({
				token,
				location,
				files: buildCatalogFiles(value.entries, value.sourceRowsById),
				expectedVersion: version,
				message,
			})
			if (saved.ok) return
			if (saved.conflict) throw new WriteConflictError('the shared catalog')
			throw new Error(
				`GitHub API error updating the shared catalog: ${saved.status}`,
			)
		},
	})

	// A write must be visible to the very next read, for every reader in this
	// process (the UI and the MCP HTTP transport share this module) — otherwise
	// a stale snapshot keeps serving for up to the TTL after a save.
	snapshotByToken.clear()
	return result
}

/** What a saved bank import did: the parse it applied, and the catalog size around it. */
export type BankCatalogImport = {
	parseResult: BankJsonParseForImportResult
	catalogSizeBefore: number
	catalogSizeAfter: number
	/** False when no row could be imported, so nothing was saved. */
	saved: boolean
}

/**
 * Merge a bank payload into the shared catalog and store its source rows, in
 * one compare-and-swap commit (see {@link updateSharedCatalog}). The payload is
 * parsed against the catalog as it stands at the save — not an earlier read —
 * so re-type notes and refreshes are reported against what was really there.
 * Shared by the web import card and the MCP import tool.
 */
export function importBankCatalog(params: {
	token: string
	payload: unknown
	source: CommitSource
}): Promise<BankCatalogImport> {
	return updateSharedCatalog<BankCatalogImport>({
		token: params.token,
		change: ({ entries, sourceRowsById }) => {
			const parseResult = parseBankJsonForImport(params.payload, entries)
			if (parseResult.entries.length === 0) {
				return {
					result: {
						parseResult,
						catalogSizeBefore: entries.length,
						catalogSizeAfter: entries.length,
						saved: false,
					},
				}
			}
			const merged = mergeBankIntoCatalog(entries, parseResult.entries)
			return {
				write: {
					entries: merged,
					// A fund re-imported replaces its stored row.
					sourceRowsById: { ...sourceRowsById, ...parseResult.sourceRowsById },
				},
				message: commitMessage({
					summary: `Import bank catalog (${parseResult.entries.length} rows)`,
					source: params.source,
				}),
				result: {
					parseResult,
					catalogSizeBefore: entries.length,
					catalogSizeAfter: merged.length,
					saved: true,
				},
			}
		},
	})
}
