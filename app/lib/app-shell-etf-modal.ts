import { ETF_DETAIL_SEARCH_PARAM } from '../features/catalog/catalog-etf-search-param.ts'

/**
 * Current URL with only `etf` removed — close link for the global ETF modal (`?etf=`).
 */
export function appShellEtfCloseHref(requestUrl: string): string {
	const url = new URL(requestUrl)
	url.searchParams.delete(ETF_DETAIL_SEARCH_PARAM)
	const qs = url.searchParams.toString()
	return qs ? `${url.pathname}?${qs}` : url.pathname
}
