import { createCookie } from 'remix/cookie'
import {
	DEFAULT_UI_LOCALE,
	type UiLocale,
	UI_LOCALE_COOKIE_NAME,
	isUiLocale,
} from './ui-locale.ts'

/**
 * Persists UI language (English / Polish). Not HttpOnly so ?locale= redirects
 * can set it from middleware without a round-trip through a form-only flow.
 */
export const uiLocaleCookie = createCookie(UI_LOCALE_COOKIE_NAME, {
	path: '/',
	sameSite: 'lax',
	maxAge: 60 * 60 * 24 * 365,
})

export function parseUiLocaleCookie(raw: unknown): UiLocale {
	if (isUiLocale(raw)) return raw
	return DEFAULT_UI_LOCALE
}
