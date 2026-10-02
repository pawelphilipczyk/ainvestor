import {
	literal,
	number,
	object,
	optional,
	parseSafe,
	string,
} from 'remix/data-schema'
import {
	readFiles,
	writeFile,
	writeFiles,
} from '../../lib/store/github-repo-store.ts'
import { type AdviceDocument, AdviceDocumentSchema } from './advice-document.ts'
import {
	ADVICE_ANALYSIS_MODES,
	ADVICE_MODEL_IDS,
	type AdviceAnalysisMode,
	type AdviceModelId,
	DEFAULT_ADVICE_ANALYSIS_MODE,
	DEFAULT_ADVICE_MODEL,
} from './advice-openai.ts'

/** Legacy single-file snapshot (both modes); still read for migration. */
export const ADVICE_STORAGE_FILENAME = 'advice-analysis.json'

export const ADVICE_BUY_NEXT_STORAGE_FILENAME = 'advice-buy-next.json'

export const ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME =
	'advice-portfolio-review.json'

/** Filename per analysis mode (single source for save / fetch / clear). */
export const ADVICE_FILENAME_BY_MODE = {
	buy_next: ADVICE_BUY_NEXT_STORAGE_FILENAME,
	portfolio_review: ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME,
} as const satisfies Record<AdviceAnalysisMode, string>

const STORED_VERSION = 1 as const

const storedAdviceAnalysisSchema = object({
	version: literal(STORED_VERSION),
	savedAt: number(),
	lastAnalysisMode: string(),
	cashCurrency: string(),
	cashAmount: optional(string()),
	selectedModel: string(),
	activeTab: optional(string()),
	document: AdviceDocumentSchema,
})

export type StoredAdviceAnalysis = {
	version: typeof STORED_VERSION
	savedAt: number
	lastAnalysisMode: AdviceAnalysisMode
	cashCurrency: string
	cashAmount?: string
	selectedModel: AdviceModelId
	activeTab?: AdviceAnalysisMode
	document: AdviceDocument
}

/** In-memory overlay for tests (avoids mocking `fetch`). */
const storageTestState: {
	enabled: boolean
	byTab: Partial<Record<AdviceAnalysisMode, StoredAdviceAnalysis | null>>
	lastSaved: StoredAdviceAnalysis | null
	saveShouldFail: boolean
} = {
	enabled: false,
	byTab: {},
	lastSaved: null,
	saveShouldFail: false,
}

export function setAdviceStorageTestOverlay(
	fetchReturn: StoredAdviceAnalysis | null,
): void {
	storageTestState.enabled = true
	storageTestState.saveShouldFail = false
	storageTestState.lastSaved = null
	if (fetchReturn === null) {
		storageTestState.byTab = {}
	} else {
		const tab = fetchReturn.activeTab ?? fetchReturn.lastAnalysisMode
		storageTestState.byTab = { [tab]: fetchReturn }
	}
}

export function resetAdviceStorageTestOverlay(): void {
	storageTestState.enabled = false
	storageTestState.byTab = {}
	storageTestState.lastSaved = null
	storageTestState.saveShouldFail = false
}

/** When the test overlay is on, the next save throws (simulates API failure). */
export function setAdviceStorageTestSaveShouldFail(shouldFail: boolean): void {
	storageTestState.saveShouldFail = shouldFail
}

export function getAdviceStorageLastSavedInTest(): StoredAdviceAnalysis | null {
	return storageTestState.lastSaved
}

function normalizeAnalysisMode(raw: string): AdviceAnalysisMode | null {
	return (ADVICE_ANALYSIS_MODES as readonly string[]).includes(raw)
		? (raw as AdviceAnalysisMode)
		: null
}

/** Analyses saved under a retired model id (e.g. the GPT-5.4 line) still render, on the default. */
function normalizeModelId(raw: string): AdviceModelId {
	return (ADVICE_MODEL_IDS as readonly string[]).includes(raw)
		? (raw as AdviceModelId)
		: DEFAULT_ADVICE_MODEL
}

export function parseStoredAdviceAnalysisFromFile(
	content: string | null | undefined,
): StoredAdviceAnalysis | null {
	if (content == null || content.trim() === '') return null
	let parsed: unknown
	try {
		parsed = JSON.parse(content)
	} catch {
		return null
	}
	const result = parseSafe(storedAdviceAnalysisSchema, parsed)
	if (!result.success) return null
	const value = result.value
	const lastAnalysisMode = normalizeAnalysisMode(value.lastAnalysisMode)
	const selectedModel = normalizeModelId(value.selectedModel)
	if (lastAnalysisMode === null) return null
	const activeTabRaw = value.activeTab
	const activeTab =
		activeTabRaw !== undefined && activeTabRaw !== null
			? normalizeAnalysisMode(activeTabRaw)
			: undefined
	return {
		version: STORED_VERSION,
		savedAt: value.savedAt,
		lastAnalysisMode,
		cashCurrency: value.cashCurrency,
		cashAmount: value.cashAmount,
		selectedModel,
		...(activeTab !== undefined && activeTab !== null ? { activeTab } : {}),
		document: value.document as AdviceDocument,
	}
}

function storedMatchesTab(
	stored: StoredAdviceAnalysis,
	tab: AdviceAnalysisMode,
): boolean {
	const storedTab = stored.activeTab ?? stored.lastAnalysisMode
	return storedTab === tab
}

/**
 * Why there is no analysis to show, when there is none.
 *
 * The page only ever needed "a snapshot or nothing", but a client asking for one
 * over MCP has to be told which of the three happened: an analysis that was
 * never generated, one stored in a shape this version cannot read, and a repository
 * GitHub refused to hand over are three different problems with three different
 * fixes, and reporting them all as "nothing saved" invites regenerating an
 * analysis that is in fact sitting right there.
 */
export type StoredAdviceAnalysisOutcome =
	| { status: 'found'; stored: StoredAdviceAnalysis }
	| { status: 'not_found' }
	/**
	 * `file` says which one could not be parsed. The legacy file is shared by
	 * both modes, so a corrupt one may or may not hold the mode that was asked
	 * for — a caller that reports it must not claim it does.
	 */
	| { status: 'malformed'; file: 'mode' | 'legacy' }
	| { status: 'unreadable'; httpStatus: number }

function hasStoredContent(content: string | null | undefined): boolean {
	return content != null && content.trim() !== ''
}

/**
 * Read saved analysis for one tab from the repository, naming the reason when there is
 * none. Uses a per-mode file; falls back to legacy `advice-analysis.json` when
 * the mode-specific file is missing.
 */
export async function fetchStoredAdviceAnalysisOutcomeForTab(
	token: string,
	dataRepo: string,
	tab: AdviceAnalysisMode,
): Promise<StoredAdviceAnalysisOutcome> {
	if (storageTestState.enabled) {
		const stored = storageTestState.byTab[tab] ?? null
		return stored === null
			? { status: 'not_found' }
			: { status: 'found', stored }
	}
	const modeFilename = ADVICE_FILENAME_BY_MODE[tab]
	// One request for both files: the legacy fallback below must not cost a
	// second round trip on every read.
	const result = await readFiles({
		token,
		location: dataRepo,
		paths: [modeFilename, ADVICE_STORAGE_FILENAME],
	})
	if (!result.ok) {
		return { status: 'unreadable', httpStatus: result.status }
	}
	const primaryContent = result.files[modeFilename]?.content ?? null
	const primary = parseStoredAdviceAnalysisFromFile(primaryContent)
	if (primary !== null && storedMatchesTab(primary, tab)) {
		return { status: 'found', stored: primary }
	}
	const legacyContent = result.files[ADVICE_STORAGE_FILENAME]?.content ?? null
	const legacy = parseStoredAdviceAnalysisFromFile(legacyContent)
	if (legacy !== null && storedMatchesTab(legacy, tab)) {
		return { status: 'found', stored: legacy }
	}
	// A file that is present but unparseable is a different failure from one that
	// was never written. A file that parses but belongs to the *other* tab is
	// neither: for this tab there is simply nothing saved.
	if (hasStoredContent(primaryContent) && primary === null) {
		return { status: 'malformed', file: 'mode' }
	}
	if (hasStoredContent(legacyContent) && legacy === null) {
		return { status: 'malformed', file: 'legacy' }
	}
	return { status: 'not_found' }
}

/**
 * Read saved analysis for one tab, or null when there is none to show. The
 * rendering path wants exactly that; {@link fetchStoredAdviceAnalysisOutcomeForTab}
 * is for callers that must report *why* there is none.
 */
export async function fetchStoredAdviceAnalysisForTab(
	token: string,
	dataRepo: string,
	tab: AdviceAnalysisMode,
): Promise<StoredAdviceAnalysis | null> {
	const outcome = await fetchStoredAdviceAnalysisOutcomeForTab(
		token,
		dataRepo,
		tab,
	)
	return outcome.status === 'found' ? outcome.stored : null
}

/** @deprecated Use {@link fetchStoredAdviceAnalysisForTab} with an explicit tab. */
export async function fetchStoredAdviceAnalysis(
	token: string,
	dataRepo: string,
): Promise<StoredAdviceAnalysis | null> {
	return fetchStoredAdviceAnalysisForTab(
		token,
		dataRepo,
		DEFAULT_ADVICE_ANALYSIS_MODE,
	)
}

function buildAdviceAnalysisPayload(stored: StoredAdviceAnalysis): unknown {
	return {
		version: stored.version,
		savedAt: stored.savedAt,
		lastAnalysisMode: stored.lastAnalysisMode,
		cashCurrency: stored.cashCurrency,
		...(stored.cashAmount !== undefined && stored.cashAmount.length > 0
			? { cashAmount: stored.cashAmount }
			: {}),
		selectedModel: stored.selectedModel,
		...(stored.activeTab !== undefined ? { activeTab: stored.activeTab } : {}),
		document: stored.document,
	}
}

export async function saveStoredAdviceAnalysisForTab(
	token: string,
	dataRepo: string,
	tab: AdviceAnalysisMode,
	stored: StoredAdviceAnalysis,
	message?: string,
): Promise<void> {
	if (storageTestState.enabled) {
		if (storageTestState.saveShouldFail) {
			throw new Error('simulated save failure (test overlay)')
		}
		storageTestState.lastSaved = stored
		storageTestState.byTab[tab] = stored
		return
	}
	const filename = ADVICE_FILENAME_BY_MODE[tab]
	const result = await writeFile({
		token,
		location: dataRepo,
		path: filename,
		content: JSON.stringify(buildAdviceAnalysisPayload(stored), null, 2),
		message,
	})
	if (!result.ok) {
		throw new Error(`GitHub API error saving advice snapshot: ${result.status}`)
	}
}

/** @deprecated Use {@link saveStoredAdviceAnalysisForTab}. */
export async function saveStoredAdviceAnalysis(
	token: string,
	dataRepo: string,
	stored: StoredAdviceAnalysis,
): Promise<void> {
	const tab = stored.activeTab ?? stored.lastAnalysisMode
	return saveStoredAdviceAnalysisForTab(token, dataRepo, tab, stored)
}

export async function clearStoredAdviceAnalysisForTab(
	token: string,
	dataRepo: string,
	tab: AdviceAnalysisMode,
	message?: string,
): Promise<void> {
	if (storageTestState.enabled) {
		storageTestState.byTab[tab] = null
		return
	}
	const filename = ADVICE_FILENAME_BY_MODE[tab]
	const result = await writeFile({
		token,
		location: dataRepo,
		path: filename,
		content: null,
		message,
	})
	if (!result.ok) {
		throw new Error(
			`GitHub API error clearing advice snapshot: ${result.status}`,
		)
	}
}

/** Clears legacy unified file only (per-tab files unchanged). */
export async function clearLegacyUnifiedAdviceAnalysis(
	token: string,
	dataRepo: string,
	message?: string,
): Promise<void> {
	if (storageTestState.enabled) {
		return
	}
	const result = await writeFile({
		token,
		location: dataRepo,
		path: ADVICE_STORAGE_FILENAME,
		content: null,
		message,
	})
	if (!result.ok) {
		throw new Error(
			`GitHub API error clearing legacy advice snapshot: ${result.status}`,
		)
	}
}

/** @deprecated Use {@link clearStoredAdviceAnalysisForTab}. */
export async function clearStoredAdviceAnalysis(
	token: string,
	dataRepo: string,
): Promise<void> {
	if (storageTestState.enabled) {
		storageTestState.byTab = {}
		storageTestState.lastSaved = null
		return
	}
	const result = await writeFiles({
		token,
		location: dataRepo,
		files: {
			[ADVICE_STORAGE_FILENAME]: null,
			[ADVICE_BUY_NEXT_STORAGE_FILENAME]: null,
			[ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME]: null,
		},
	})
	if (!result.ok) {
		throw new Error(
			`GitHub API error clearing advice snapshot: ${result.status}`,
		)
	}
}
