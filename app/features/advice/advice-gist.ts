import {
	literal,
	number,
	object,
	optional,
	parseSafe,
	string,
} from 'remix/data-schema'
import { type AdviceDocument, AdviceDocumentSchema } from './advice-document.ts'
import {
	ADVICE_ANALYSIS_MODES,
	ADVICE_MODEL_IDS,
	type AdviceAnalysisMode,
	type AdviceModelId,
	DEFAULT_ADVICE_ANALYSIS_MODE,
} from './advice-openai.ts'

/** Legacy single-file snapshot (both modes); still read for migration. */
export const ADVICE_STORAGE_FILENAME = 'advice-analysis.json'

export const ADVICE_BUY_NEXT_STORAGE_FILENAME = 'advice-buy-next.json'

export const ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME =
	'advice-portfolio-review.json'

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

function storageFilenameForAnalysisMode(mode: AdviceAnalysisMode): string {
	return mode === 'portfolio_review'
		? ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME
		: ADVICE_BUY_NEXT_STORAGE_FILENAME
}

/** In-memory overlay for tests (avoids mocking `fetch`). */
const gistTestState: {
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

export function setAdviceGistTestOverlay(
	fetchReturn: StoredAdviceAnalysis | null,
): void {
	gistTestState.enabled = true
	gistTestState.saveShouldFail = false
	gistTestState.lastSaved = null
	if (fetchReturn === null) {
		gistTestState.byTab = {}
	} else {
		const tab = fetchReturn.activeTab ?? fetchReturn.lastAnalysisMode
		gistTestState.byTab = { [tab]: fetchReturn }
	}
}

export function resetAdviceGistTestOverlay(): void {
	gistTestState.enabled = false
	gistTestState.byTab = {}
	gistTestState.lastSaved = null
	gistTestState.saveShouldFail = false
}

/** When the test overlay is on, the next gist save throws (simulates API failure). */
export function setAdviceGistTestSaveShouldFail(shouldFail: boolean): void {
	gistTestState.saveShouldFail = shouldFail
}

export function getAdviceGistLastSavedInTest(): StoredAdviceAnalysis | null {
	return gistTestState.lastSaved
}

type GistFile = {
	content: string | null
}

type GistPayload = {
	files: Record<string, GistFile>
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

function normalizeAnalysisMode(raw: string): AdviceAnalysisMode | null {
	return (ADVICE_ANALYSIS_MODES as readonly string[]).includes(raw)
		? (raw as AdviceAnalysisMode)
		: null
}

function normalizeModelId(raw: string): AdviceModelId | null {
	return (ADVICE_MODEL_IDS as readonly string[]).includes(raw)
		? (raw as AdviceModelId)
		: null
}

export function parseStoredAdviceAnalysisFromGistFile(
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
	if (lastAnalysisMode === null || selectedModel === null) return null
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
 * Read saved analysis for one tab from the gist. Uses a per-mode file; falls back to
 * legacy `advice-analysis.json` when the mode-specific file is missing.
 */
export async function fetchStoredAdviceAnalysisForTab(
	token: string,
	gistId: string,
	tab: AdviceAnalysisMode,
): Promise<StoredAdviceAnalysis | null> {
	if (gistTestState.enabled) {
		return gistTestState.byTab[tab] ?? null
	}
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		headers: githubHeaders(token),
	})
	if (!response.ok) return null
	const gist = (await response.json()) as GistPayload
	const primaryName = storageFilenameForAnalysisMode(tab)
	const primary = parseStoredAdviceAnalysisFromGistFile(
		gist.files[primaryName]?.content ?? null,
	)
	if (primary !== null && storedMatchesTab(primary, tab)) {
		return primary
	}
	const legacy = parseStoredAdviceAnalysisFromGistFile(
		gist.files[ADVICE_STORAGE_FILENAME]?.content ?? null,
	)
	if (legacy !== null && storedMatchesTab(legacy, tab)) {
		return legacy
	}
	return null
}

/** @deprecated Use {@link fetchStoredAdviceAnalysisForTab} with an explicit tab. */
export async function fetchStoredAdviceAnalysis(
	token: string,
	gistId: string,
): Promise<StoredAdviceAnalysis | null> {
	return fetchStoredAdviceAnalysisForTab(
		token,
		gistId,
		DEFAULT_ADVICE_ANALYSIS_MODE,
	)
}

export function buildAdviceAnalysisGistPatchForFile(
	filename: string,
	stored: StoredAdviceAnalysis,
): {
	files: Record<string, { content: string }>
} {
	const payload = {
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
	return {
		files: {
			[filename]: {
				content: JSON.stringify(payload, null, 2),
			},
		},
	}
}

export async function saveStoredAdviceAnalysisForTab(
	token: string,
	gistId: string,
	tab: AdviceAnalysisMode,
	stored: StoredAdviceAnalysis,
): Promise<void> {
	if (gistTestState.enabled) {
		if (gistTestState.saveShouldFail) {
			throw new Error('simulated gist save failure (test overlay)')
		}
		gistTestState.lastSaved = stored
		gistTestState.byTab[tab] = stored
		return
	}
	const filename = storageFilenameForAnalysisMode(tab)
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify(buildAdviceAnalysisGistPatchForFile(filename, stored)),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error saving advice snapshot: ${response.status}`,
		)
	}
}

/** @deprecated Use {@link saveStoredAdviceAnalysisForTab}. */
export async function saveStoredAdviceAnalysis(
	token: string,
	gistId: string,
	stored: StoredAdviceAnalysis,
): Promise<void> {
	const tab = stored.activeTab ?? stored.lastAnalysisMode
	return saveStoredAdviceAnalysisForTab(token, gistId, tab, stored)
}

function buildClearAdviceFilePatch(filename: string): {
	files: Record<string, null>
} {
	return { files: { [filename]: null } }
}

export async function clearStoredAdviceAnalysisForTab(
	token: string,
	gistId: string,
	tab: AdviceAnalysisMode,
): Promise<void> {
	if (gistTestState.enabled) {
		gistTestState.byTab[tab] = null
		return
	}
	const filename = storageFilenameForAnalysisMode(tab)
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify(buildClearAdviceFilePatch(filename)),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error clearing advice snapshot: ${response.status}`,
		)
	}
}

/** Clears legacy unified file only (per-tab files unchanged). */
export async function clearLegacyUnifiedAdviceAnalysis(
	token: string,
	gistId: string,
): Promise<void> {
	if (gistTestState.enabled) {
		return
	}
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify(buildClearAdviceFilePatch(ADVICE_STORAGE_FILENAME)),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error clearing legacy advice snapshot: ${response.status}`,
		)
	}
}

/** @deprecated Use {@link clearStoredAdviceAnalysisForTab}. */
export async function clearStoredAdviceAnalysis(
	token: string,
	gistId: string,
): Promise<void> {
	if (gistTestState.enabled) {
		gistTestState.byTab = {}
		gistTestState.lastSaved = null
		return
	}
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify({
			files: {
				[ADVICE_STORAGE_FILENAME]: null,
				[ADVICE_BUY_NEXT_STORAGE_FILENAME]: null,
				[ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME]: null,
			},
		}),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error clearing advice snapshot: ${response.status}`,
		)
	}
}
