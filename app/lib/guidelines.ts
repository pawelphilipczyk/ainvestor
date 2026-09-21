import { ETF_TYPE_LABELS } from '../locales/en.ts'
import { ETF_TYPE_LABELS_PL } from '../locales/pl.ts'
import type { EtfType } from './etf-type.ts'
import { ETF_TYPES, GUIDELINE_ETF_TYPES } from './etf-type.ts'
import { t } from './i18n.ts'
import {
	putPrivateGistTestGuidelines,
	takePrivateGistTestGuidelines,
} from './private-gist-test-store.ts'
import { readFile, writeFile } from './store/github-store.ts'
import { getUiLocale } from './ui-locale.ts'

export const GUIDELINES_FILENAME = 'guidelines.json'

export type { EtfType } from './etf-type.ts'
export { ETF_TYPES, GUIDELINE_ETF_TYPES } from './etf-type.ts'
/** Human-readable ETF category label for persisted `EtfType` keys (UI locale, not broker data). */
export function formatEtfTypeLabel(etfType: EtfType): string {
	const labels = getUiLocale() === 'pl' ? ETF_TYPE_LABELS_PL : ETF_TYPE_LABELS
	const label = labels[etfType]
	if (typeof label === 'string' && label.length > 0) {
		return label
	}
	return t('catalog.etfTypeUnknown')
}

export type GuidelineKind = 'asset_class' | 'instrument'

export const GUIDELINE_KINDS = [
	'asset_class',
	'instrument',
] as const satisfies readonly GuidelineKind[]

export type EtfGuideline = {
	id: string
	/** Asset-class bucket vs a specific fund target (hybrid model). */
	kind: GuidelineKind
	etfName: string
	targetPct: number
	etfType: EtfType
}

/**
 * Bounds for one guideline's `targetPct`, shared by every entry point that
 * accepts a target — the web form's schema and the MCP write tool — so the two
 * cannot drift into accepting different numbers.
 */
export const GUIDELINE_TARGET_PERCENT_MIN = 0.001
export const GUIDELINE_TARGET_PERCENT_MAX = 100

const GUIDELINE_TOTAL_EPS = 1e-9

function finiteGuidelineTargetPercent(value: number): number {
	return Number.isFinite(value) ? value : 0
}

/** Sum of all guideline `targetPct` values (instrument + bucket rows). */
export function sumGuidelineTargetPercent(guidelines: EtfGuideline[]): number {
	return guidelines.reduce(
		(total, guideline) =>
			total + finiteGuidelineTargetPercent(guideline.targetPct),
		0,
	)
}

/** Display string for guideline target % inputs (matches server-side rounding in error messages). */
export function formatGuidelineTargetPercentForInput(value: number): string {
	const finitePercent = finiteGuidelineTargetPercent(value)
	const rounded = Math.round(finitePercent * 100) / 100
	return String(rounded)
}

/** Clamp a percentage to 0–100 for visual bars; non-finite input becomes 0. */
export function clampGuidelineBarWidthPercent(value: number): number {
	const finitePercent = finiteGuidelineTargetPercent(value)
	return Math.min(100, Math.max(0, finitePercent))
}

/** True if adding `additionalPercent` to `existing` would push the total above 100%. */
export function wouldGuidelineTotalExceedCap(params: {
	existing: EtfGuideline[]
	additionalPercent: number
}): boolean {
	return (
		sumGuidelineTargetPercent(params.existing) + params.additionalPercent >
		100 + GUIDELINE_TOTAL_EPS
	)
}

/**
 * Returns an existing guideline that blocks adding `entry`: same ticker (instrument)
 * or same asset class (bucket). Instrument tickers are compared case-insensitively.
 */
export function findGuidelineDuplicateOf(
	existing: EtfGuideline[],
	entry: EtfGuideline,
): EtfGuideline | null {
	const normalizedEntryTicker =
		entry.kind === 'instrument' ? entry.etfName.trim().toUpperCase() : null
	for (const guideline of existing) {
		if (entry.kind === 'instrument' && guideline.kind === 'instrument') {
			const normalizedExistingTicker = guideline.etfName.trim().toUpperCase()
			if (normalizedExistingTicker === normalizedEntryTicker) {
				return guideline
			}
		}
		if (entry.kind === 'asset_class' && guideline.kind === 'asset_class') {
			if (guideline.etfType === entry.etfType) {
				return guideline
			}
		}
	}
	return null
}

export function isEtfType(value: unknown): value is EtfType {
	return (
		typeof value === 'string' &&
		(ETF_TYPES as readonly string[]).includes(value)
	)
}

/** A type a guideline may target — every `EtfType` except `unknown`. */
export function isGuidelineEtfType(value: unknown): value is EtfType {
	return (
		typeof value === 'string' &&
		(GUIDELINE_ETF_TYPES as readonly string[]).includes(value)
	)
}

/** Normalize gist JSON rows (legacy rows omit `kind` → instrument). */
export function normalizeGuideline(raw: unknown): EtfGuideline | null {
	if (!raw || typeof raw !== 'object') return null
	const rawRecord = raw as Record<string, unknown>
	if (
		typeof rawRecord.id !== 'string' ||
		typeof rawRecord.targetPct !== 'number'
	)
		return null
	if (!isEtfType(rawRecord.etfType)) return null

	const kind: GuidelineKind =
		rawRecord.kind === 'asset_class' || rawRecord.kind === 'instrument'
			? rawRecord.kind
			: 'instrument'

	let etfName =
		typeof rawRecord.etfName === 'string' ? rawRecord.etfName.trim() : ''
	if (kind === 'instrument' && etfName.length === 0) return null

	if (kind === 'asset_class') etfName = ''

	return {
		id: rawRecord.id,
		kind,
		etfName,
		targetPct: rawRecord.targetPct,
		etfType: rawRecord.etfType,
	}
}

type GistFile = {
	content: string | null
}

type GistPayload = {
	files: Record<string, GistFile>
}

/** Parse guidelines from a raw GitHub Gist API response object. */
export function parseGuidelinesFromGist(gist: GistPayload): EtfGuideline[] {
	const file = gist.files[GUIDELINES_FILENAME]
	if (!file || !file.content) return []
	try {
		const parsed = JSON.parse(file.content)
		if (!Array.isArray(parsed)) return []
		return parsed
			.map(normalizeGuideline)
			.filter((row): row is EtfGuideline => row !== null)
	} catch {
		return []
	}
}

/** Build a PATCH-ready body to update the guidelines file in a gist. */
export function buildGuidelinesGistPatch(guidelines: EtfGuideline[]): {
	files: Record<string, { content: string }>
} {
	return {
		files: {
			[GUIDELINES_FILENAME]: {
				content: JSON.stringify(guidelines, null, 2),
			},
		},
	}
}

type GuidelinesGistReadResult =
	| { ok: true; guidelines: EtfGuideline[] }
	| { ok: false; status: number }

async function readGuidelinesGist(
	token: string,
	gistId: string,
): Promise<GuidelinesGistReadResult> {
	const testRows = takePrivateGistTestGuidelines(token, gistId)
	if (testRows !== null) return { ok: true, guidelines: testRows }
	const result = await readFile({
		token,
		location: gistId,
		path: GUIDELINES_FILENAME,
	})
	if (!result.ok) return { ok: false, status: result.status }
	return {
		ok: true,
		guidelines: parseGuidelinesFromGist({
			files: result.file
				? { [GUIDELINES_FILENAME]: { content: result.file.content } }
				: {},
		}),
	}
}

/**
 * Fetch guidelines from an existing gist by ID, failing loudly when GitHub
 * rejects the read.
 *
 * Use this wherever an empty list and an unreachable gist must not look alike —
 * a read-modify-write above all, where mistaking a rejected read for "no
 * guidelines" would save a list that silently drops every existing row.
 */
export async function fetchGuidelinesOrThrow(
	token: string,
	gistId: string,
): Promise<EtfGuideline[]> {
	const result = await readGuidelinesGist(token, gistId)
	if (!result.ok) {
		throw new Error(
			`GitHub API error fetching guidelines gist: ${result.status}`,
		)
	}
	return result.guidelines
}

/**
 * Fetch guidelines for a read-only view, where a rejected read shows as an empty
 * list so the page still renders. Never build a list you then save from this.
 */
export async function fetchGuidelines(
	token: string,
	gistId: string,
): Promise<EtfGuideline[]> {
	const result = await readGuidelinesGist(token, gistId)
	return result.ok ? result.guidelines : []
}

type GuidelinesGistWriteResult = { ok: true } | { ok: false; status: number }

async function writeGuidelinesGist(params: {
	token: string
	gistId: string
	guidelines: EtfGuideline[]
}): Promise<GuidelinesGistWriteResult> {
	if (
		putPrivateGistTestGuidelines(params.token, params.gistId, params.guidelines)
	) {
		return { ok: true }
	}
	const patch = buildGuidelinesGistPatch(params.guidelines)
	const result = await writeFile({
		token: params.token,
		location: params.gistId,
		path: GUIDELINES_FILENAME,
		content: patch.files[GUIDELINES_FILENAME].content,
	})
	return result.ok ? { ok: true } : { ok: false, status: result.status }
}

/** Save guidelines to an existing gist by ID, failing loudly when GitHub rejects the write. */
export async function saveGuidelinesOrThrow(
	token: string,
	gistId: string,
	guidelines: EtfGuideline[],
): Promise<void> {
	const result = await writeGuidelinesGist({ token, gistId, guidelines })
	if (!result.ok) {
		throw new Error(`GitHub API error saving guidelines gist: ${result.status}`)
	}
}

/** Save guidelines, ignoring a rejected write (the web app's long-standing behaviour). */
export async function saveGuidelines(
	token: string,
	gistId: string,
	guidelines: EtfGuideline[],
): Promise<void> {
	await writeGuidelinesGist({ token, gistId, guidelines })
}
