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
} from './advice-openai.ts'

export const ADVICE_STORAGE_FILENAME = 'advice-analysis.json'

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
const gistTestState: {
	enabled: boolean
	fetchReturn: StoredAdviceAnalysis | null
	lastSaved: StoredAdviceAnalysis | null
} = {
	enabled: false,
	fetchReturn: null,
	lastSaved: null,
}

export function setAdviceGistTestOverlay(
	fetchReturn: StoredAdviceAnalysis | null,
): void {
	gistTestState.enabled = true
	gistTestState.fetchReturn = fetchReturn
	gistTestState.lastSaved = null
}

export function resetAdviceGistTestOverlay(): void {
	gistTestState.enabled = false
	gistTestState.fetchReturn = null
	gistTestState.lastSaved = null
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

export async function fetchStoredAdviceAnalysis(
	token: string,
	gistId: string,
): Promise<StoredAdviceAnalysis | null> {
	if (gistTestState.enabled) {
		return gistTestState.fetchReturn
	}
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		headers: githubHeaders(token),
	})
	if (!response.ok) return null
	const gist = (await response.json()) as GistPayload
	const file = gist.files[ADVICE_STORAGE_FILENAME]
	return parseStoredAdviceAnalysisFromGistFile(file?.content ?? null)
}

export function buildAdviceAnalysisGistPatch(stored: StoredAdviceAnalysis): {
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
			[ADVICE_STORAGE_FILENAME]: {
				content: JSON.stringify(payload, null, 2),
			},
		},
	}
}

export async function saveStoredAdviceAnalysis(
	token: string,
	gistId: string,
	stored: StoredAdviceAnalysis,
): Promise<void> {
	if (gistTestState.enabled) {
		gistTestState.lastSaved = stored
		return
	}
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify(buildAdviceAnalysisGistPatch(stored)),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error saving advice snapshot: ${response.status}`,
		)
	}
}

function buildClearAdviceAnalysisGistPatch(): {
	files: Record<string, null>
} {
	return {
		files: {
			[ADVICE_STORAGE_FILENAME]: null,
		},
	}
}

export async function clearStoredAdviceAnalysis(
	token: string,
	gistId: string,
): Promise<void> {
	if (gistTestState.enabled) {
		gistTestState.fetchReturn = null
		return
	}
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify(buildClearAdviceAnalysisGistPatch()),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error clearing advice snapshot: ${response.status}`,
		)
	}
}
