import { routes } from '../../routes.ts'
import { ETF_DETAIL_SEARCH_PARAM } from './catalog-etf-search-param.ts'
import type { CatalogRiskBand } from './lib.ts'

export function catalogIndexHrefWithFilters(options: {
	typeFilter: string
	riskFilter: '' | CatalogRiskBand
	query: string
	catalogEntryId?: string
	model?: string
}): string {
	const searchParams = new URLSearchParams()
	if (options.typeFilter) searchParams.set('type', options.typeFilter)
	if (options.riskFilter) searchParams.set('risk', options.riskFilter)
	if (options.query) searchParams.set('q', options.query)
	if (options.catalogEntryId) {
		searchParams.set(ETF_DETAIL_SEARCH_PARAM, options.catalogEntryId)
	}
	if (options.model) searchParams.set('model', options.model)
	const qs = searchParams.toString()
	const base = routes.catalog.index.href()
	return qs ? `${base}?${qs}` : base
}
