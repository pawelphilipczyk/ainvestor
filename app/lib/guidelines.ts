import { ETF_TYPE_LABELS } from '../locales/en.ts'
import { t } from './i18n.ts'

export const GUIDELINES_FILENAME = 'guidelines.json'

export type EtfType =
	| 'equity'
	| 'bond'
	| 'real_estate'
	| 'commodity'
	| 'mixed'
	| 'money_market'

export const ETF_TYPES = [
	'equity',
	'bond',
	'real_estate',
	'commodity',
	'mixed',
	'money_market',
] as const satisfies readonly EtfType[]

/** Human-readable ETF category label (locale-backed; default English). */
export function formatEtfTypeLabel(etfType: EtfType): string {
	const label = ETF_TYPE_LABELS[etfType]
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

const GUIDELINE_TOTAL_EPS = 1e-9

function finiteGuidelineTargetPct(n: number): number {
	return Number.isFinite(n) ? n : 0
}

/** Sum of all guideline `targetPct` values (instrument + bucket rows). */
export function sumGuidelineTargetPct(guidelines: EtfGuideline[]): number {
	return guidelines.reduce(
		(sum, g) => sum + finiteGuidelineTargetPct(g.targetPct),
		0,
	)
}

/** Display string for guideline target % inputs (matches server-side rounding in error messages). */
export function formatGuidelineTargetPctForInput(value: number): string {
	const finitePct = finiteGuidelineTargetPct(value)
	const rounded = Math.round(finitePct * 100) / 100
	return String(rounded)
}

/** Clamp a guideline target % to 0–100 for visual bars; non-finite input becomes 0. */
export function clampGuidelineBarPct(n: number): number {
	const finitePct = finiteGuidelineTargetPct(n)
	return Math.min(100, Math.max(0, finitePct))
}

/** True if adding `additionalPct` to `existing` would push the total above 100%. */
export function wouldGuidelineTotalExceedCap(params: {
	existing: EtfGuideline[]
	additionalPct: number
}): boolean {
	return (
		sumGuidelineTargetPct(params.existing) + params.additionalPct >
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
	for (const g of existing) {
		if (entry.kind === 'instrument' && g.kind === 'instrument') {
			const normalizedExistingTicker = g.etfName.trim().toUpperCase()
			if (normalizedExistingTicker === normalizedEntryTicker) {
				return g
			}
		}
		if (entry.kind === 'asset_class' && g.kind === 'asset_class') {
			if (g.etfType === entry.etfType) {
				return g
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

const GITHUB_API = 'https://api.github.com'

function githubHeaders(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': '2022-11-28',
	}
}

/** Fetch guidelines from an existing gist by ID. */
export async function fetchGuidelines(
	token: string,
	gistId: string,
): Promise<EtfGuideline[]> {
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		headers: githubHeaders(token),
	})
	if (!response.ok) return []
	const gist = (await response.json()) as GistPayload
	return parseGuidelinesFromGist(gist)
}

/** Save guidelines to an existing gist by ID. */
export async function saveGuidelines(
	token: string,
	gistId: string,
	guidelines: EtfGuideline[],
): Promise<void> {
	await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify(buildGuidelinesGistPatch(guidelines)),
	})
}
