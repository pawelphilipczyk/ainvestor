import {
	DEFAULT_UI_LOCALE,
	isUiLocale,
	type UiLocale,
} from '../../app/lib/ui-locale.ts'

/** A tool argument that is present, a non-empty string once trimmed, or absent. */
export function readStringArgument(
	toolArguments: Record<string, unknown>,
	name: string,
): string | null {
	const value = toolArguments[name]
	if (typeof value !== 'string') return null
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : null
}

/**
 * MCP calls have no UI session, so there is no cookie to infer a locale from — callers state
 * which language they want bucket names and prose in. Defaults to DEFAULT_UI_LOCALE, matching
 * the web app's own default for a first-time visitor.
 */
export function readUiLocaleArgument(
	toolArguments: Record<string, unknown>,
): UiLocale {
	const raw = toolArguments.locale
	if (raw === undefined || raw === null) return DEFAULT_UI_LOCALE
	if (!isUiLocale(raw)) {
		throw new Error(
			`"locale" must be one of: en, pl; got ${JSON.stringify(raw)}.`,
		)
	}
	return raw
}
