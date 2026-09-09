import { en, type MessageKey } from '../locales/en.ts'
import { pl } from '../locales/pl.ts'
import { getUiLocale } from './ui-locale.ts'

export type { MessageKey }

/** Default UI locale for server-rendered copy. */
export const DEFAULT_LOCALE = 'en' as const

type Messages = Record<MessageKey, string>

const messagesByLocale = {
	en: en as unknown as Messages,
	pl: pl as unknown as Messages,
} as const

/**
 * Interpolate `{name}`-style placeholders in a template string.
 */
export function format(
	template: string,
	vars: Record<string, string | number>,
): string {
	return template.replace(/\{(\w+)\}/g, (_, key: string) => {
		const value = vars[key]
		return value !== undefined ? String(value) : `{${key}}`
	})
}

export function t(key: MessageKey): string {
	const locale = getUiLocale()
	const map = messagesByLocale[locale]
	const value = map[key]
	if (typeof value === 'string' && value.length > 0) {
		return value
	}
	return en[key]
}
