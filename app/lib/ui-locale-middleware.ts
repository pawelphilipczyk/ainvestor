import type { Middleware } from 'remix/fetch-router'
import { createRedirectResponse } from 'remix/response/redirect'
import {
	localeQueryToUiLocale,
	pathAndSearch,
	runWithUiCopyContext,
	type UiLocale,
} from './ui-locale.ts'
import { parseUiLocaleCookie, uiLocaleCookie } from './ui-locale-cookie.ts'

function pathAndSearchWithoutLocale(url: URL): string {
	const next = new URL(url.href)
	next.searchParams.delete('locale')
	const query = next.searchParams.toString()
	return query.length > 0 ? `${next.pathname}?${query}` : next.pathname
}

/**
 * Resolves UI locale from `ui_locale` cookie and optional `?locale=` query.
 * Sets the cookie when the query overrides; strips `locale` from the URL via 302.
 * Must run early (before handlers) so `t()` / `format()` see the active locale.
 */
export function uiLocaleMiddleware(): Middleware {
	return async (context, next) => {
		const requestUrl = new URL(context.request.url)
		const cookieHeader = context.request.headers.get('Cookie') ?? ''
		const cookieRaw = await uiLocaleCookie.parse(cookieHeader)
		const fromCookie = parseUiLocaleCookie(cookieRaw)

		const localeParam = requestUrl.searchParams.get('locale')
		const fromQuery = localeQueryToUiLocale(localeParam)

		if (fromQuery === 'invalid') {
			const location = pathAndSearchWithoutLocale(requestUrl)
			return createRedirectResponse(location, { status: 302 })
		}

		if (
			requestUrl.searchParams.has('locale') &&
			(fromQuery === 'en' || fromQuery === 'pl')
		) {
			const location = pathAndSearchWithoutLocale(requestUrl)
			const headers = new Headers()
			if (fromQuery !== fromCookie) {
				headers.append('Set-Cookie', await uiLocaleCookie.serialize(fromQuery))
			}
			return createRedirectResponse(location, { status: 302, headers })
		}

		const activeLocale: UiLocale =
			fromQuery === 'en' || fromQuery === 'pl' ? fromQuery : fromCookie

		const shellReturnPath = pathAndSearch(requestUrl)

		return runWithUiCopyContext({ locale: activeLocale, shellReturnPath }, () =>
			next(),
		)
	}
}
