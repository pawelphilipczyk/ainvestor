import { routes } from '../../routes.ts'
import {
	ETF_DETAIL_SEARCH_PARAM,
	parseEtfDetailSearchParam,
} from '../catalog/catalog-etf-search-param.ts'
import {
	type AdviceAnalysisMode,
	type AdviceModelId,
	DEFAULT_ADVICE_MODEL,
} from './advice-openai.ts'

export function adviceTabQueryValue(tab: AdviceAnalysisMode): string {
	return tab === 'portfolio_review' ? 'portfolio_review' : 'buy_next'
}

export function adviceIndexHrefWithOptionalEtf(options: {
	tab: AdviceAnalysisMode
	model: AdviceModelId
	catalogEntryId?: string
}): string {
	const query: Record<string, string> = {
		tab: adviceTabQueryValue(options.tab),
	}
	if (options.model !== DEFAULT_ADVICE_MODEL) {
		query.model = options.model
	}
	if (options.catalogEntryId) {
		query[ETF_DETAIL_SEARCH_PARAM] = options.catalogEntryId
	}
	return routes.advice.index.href({}, query)
}

/** Catalog row id when the URL opens the shared fund overlay (centralizes modal query handling outside page bodies). */
export function overlayCatalogEntryIdFromRequestUrl(
	requestUrl: string,
): string | null {
	return parseEtfDetailSearchParam(requestUrl)
}
