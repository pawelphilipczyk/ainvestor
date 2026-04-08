import { ETF_TYPES } from '../../lib/guidelines.ts'
import { type CatalogRiskBand, parseCatalogRiskFilterParam } from './lib.ts'

/** Browser localStorage key for ETF catalog list filters (type, risk, q). */
export const CATALOG_FILTER_PREFS_STORAGE_KEY = 'etfCatalogFiltersV1'

/** Keeps stored search strings bounded (matches conservative URL limits). */
export const CATALOG_FILTER_QUERY_MAX_LENGTH = 200

const ETF_TYPE_SET = new Set<string>(ETF_TYPES)

/**
 * Normalizes a stored or URL `type` query value to a known ETF type or empty string.
 */
export function parseCatalogTypeFilterParam(raw: string | null): string {
	if (raw === null) return ''
	const trimmed = raw.trim()
	if (trimmed.length === 0) return ''
	return ETF_TYPE_SET.has(trimmed) ? trimmed : ''
}

/**
 * Trims and caps length for the catalog search box (`q` param).
 */
export function normalizeCatalogQueryParam(raw: string | null): string {
	if (raw === null) return ''
	const trimmed = raw.trim()
	if (trimmed.length <= CATALOG_FILTER_QUERY_MAX_LENGTH) return trimmed
	return trimmed.slice(0, CATALOG_FILTER_QUERY_MAX_LENGTH)
}

export type CatalogFilterPrefs = {
	type: string
	risk: '' | CatalogRiskBand
	query: string
}

export function normalizedCatalogFilterPrefs(params: {
	type: string
	risk: string
	query: string
}): CatalogFilterPrefs {
	return {
		type: parseCatalogTypeFilterParam(params.type),
		risk: parseCatalogRiskFilterParam(
			params.risk.trim().length > 0 ? params.risk : null,
		),
		query: normalizeCatalogQueryParam(params.query),
	}
}

export function catalogFilterPrefsToSearchParams(
	prefs: CatalogFilterPrefs,
): URLSearchParams {
	const searchParams = new URLSearchParams()
	if (prefs.type.length > 0) searchParams.set('type', prefs.type)
	if (prefs.risk.length > 0) searchParams.set('risk', prefs.risk)
	if (prefs.query.length > 0) searchParams.set('q', prefs.query)
	return searchParams
}

export function catalogFilterPrefsFromUnknownJson(
	raw: unknown,
): CatalogFilterPrefs | null {
	if (raw === null || typeof raw !== 'object') return null
	const object = raw as Record<string, unknown>
	const typeRaw = typeof object.type === 'string' ? object.type : ''
	const riskRaw = typeof object.risk === 'string' ? object.risk : ''
	const queryRaw =
		typeof object.q === 'string'
			? object.q
			: typeof object.query === 'string'
				? object.query
				: ''
	return normalizedCatalogFilterPrefs({
		type: typeRaw,
		risk: riskRaw,
		query: queryRaw,
	})
}

export function catalogFilterPrefsHaveAnyFilter(
	prefs: CatalogFilterPrefs,
): boolean {
	return (
		prefs.type.length > 0 || prefs.risk.length > 0 || prefs.query.length > 0
	)
}
