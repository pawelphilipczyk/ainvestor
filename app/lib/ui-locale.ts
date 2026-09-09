import { AsyncLocalStorage } from 'node:async_hooks'

/** UI copy locales (not number/currency formatting). */
export const SUPPORTED_UI_LOCALES = ['en', 'pl'] as const

export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number]

export const DEFAULT_UI_LOCALE: UiLocale = 'en'

export const UI_LOCALE_COOKIE_NAME = 'ui_locale'

type UiCopyRequestContext = {
	locale: UiLocale
	/** Path + query for POST return (excludes `locale` — stripped before handlers). */
	shellReturnPath: string
}

const uiCopyRequestStorage = new AsyncLocalStorage<UiCopyRequestContext>()

export function runWithUiCopyContext<T>(
	context: UiCopyRequestContext,
	callback: () => T,
): T {
	return uiCopyRequestStorage.run(context, callback)
}

export function getUiLocale(): UiLocale {
	return uiCopyRequestStorage.getStore()?.locale ?? DEFAULT_UI_LOCALE
}

export function getShellReturnPath(): string {
	return uiCopyRequestStorage.getStore()?.shellReturnPath ?? '/'
}

export function isUiLocale(value: unknown): value is UiLocale {
	return (
		typeof value === 'string' &&
		(SUPPORTED_UI_LOCALES as readonly string[]).includes(value)
	)
}

/** Lowercase BCP 47 tag for `<html lang>`. */
export function uiLocaleToHtmlLang(locale: UiLocale): string {
	return locale === 'pl' ? 'pl' : 'en'
}

export function htmlLangForCurrentUiLocale(): string {
	return uiLocaleToHtmlLang(getUiLocale())
}

/**
 * Parse `?locale=` (empty means default English). Returns null if the param
 * should be ignored (invalid tag).
 */
export function localeQueryToUiLocale(
	value: string | null,
): UiLocale | null | 'invalid' {
	if (value === null) return null
	const trimmed = value.trim().toLowerCase()
	if (trimmed === '' || trimmed === 'en') return 'en'
	if (trimmed === 'pl') return 'pl'
	return 'invalid'
}

export function pathAndSearch(url: URL): string {
	const query = url.searchParams.toString()
	return query.length > 0 ? `${url.pathname}?${query}` : url.pathname
}
