import { en, type MessageKey } from '../locales/en.ts'

export type { MessageKey }

/** Default UI locale for server-rendered copy. */
export const DEFAULT_LOCALE = 'en' as const

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
	return en[key]
}
