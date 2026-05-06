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

/**
 * Same as {@link appShellEtfCloseHref} for a relative or absolute in-app `href`
 * (link targets and fragment fetch URLs).
 */
export function appShellEtfCloseHrefFromHref(href: string): string {
	const url = new URL(href, 'https://app-shell-etf-close.invalid')
	url.searchParams.delete(ETF_DETAIL_SEARCH_PARAM)
	const qs = url.searchParams.toString()
	return qs ? `${url.pathname}?${qs}` : url.pathname
}

function validateSafeRelativeAppPath(pathAndQuery: string): string | null {
	if (pathAndQuery.length > 8192) return null
	if (pathAndQuery.includes('://') || pathAndQuery.startsWith('//')) return null
	if (!pathAndQuery.startsWith('/')) return null
	if (pathAndQuery.includes('\0')) return null
	return pathAndQuery
}

/**
 * Decodes and validates the `close` query param used by ETF overlay HTML fragments.
 */
export function decodeValidatedOverlayCloseQueryParam(url: URL): string | null {
	const rawClose = url.searchParams.get('close')
	if (rawClose === null || rawClose.trim().length === 0) return null
	let decoded: string
	try {
		decoded = decodeURIComponent(rawClose.trim())
	} catch {
		return null
	}
	return validateSafeRelativeAppPath(decoded)
}
