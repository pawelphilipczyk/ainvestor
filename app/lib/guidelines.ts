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

export function isEtfType(value: unknown): value is EtfType {
	return (
		typeof value === 'string' &&
		(ETF_TYPES as readonly string[]).includes(value)
	)
}

/** Normalize gist JSON rows (legacy rows omit `kind` → instrument). */
export function normalizeGuideline(raw: unknown): EtfGuideline | null {
	if (!raw || typeof raw !== 'object') return null
	const o = raw as Record<string, unknown>
	if (typeof o.id !== 'string' || typeof o.targetPct !== 'number') return null
	if (!isEtfType(o.etfType)) return null

	const kind: GuidelineKind =
		o.kind === 'asset_class' || o.kind === 'instrument' ? o.kind : 'instrument'

	let etfName = typeof o.etfName === 'string' ? o.etfName.trim() : ''
	if (kind === 'instrument' && etfName.length === 0) return null

	if (kind === 'asset_class') etfName = ''

	return {
		id: o.id,
		kind,
		etfName,
		targetPct: o.targetPct,
		etfType: o.etfType,
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
			.filter((g): g is EtfGuideline => g !== null)
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
	const res = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		headers: githubHeaders(token),
	})
	if (!res.ok) return []
	const gist = (await res.json()) as GistPayload
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
