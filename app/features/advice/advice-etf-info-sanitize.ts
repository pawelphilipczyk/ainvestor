/** Limits and sanitization for ETF info LLM user messages (prompt-injection hardening). */

export const ETF_INFO_MAX_NAME_LENGTH = 200
export const ETF_INFO_MAX_TICKER_LENGTH = 24
export const ETF_INFO_MAX_CATALOG_LINE_LENGTH = 8000

function stripAsciiControls(value: string): string {
	let result = ''
	for (const character of value) {
		const code = character.charCodeAt(0)
		if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
			result += ' '
		} else {
			result += character
		}
	}
	return result
}

/**
 * Fund display name: trim, strip controls/newlines, weaken "---"-style delimiters,
 * cap length, remove angle brackets.
 */
export function sanitizeEtfInfoFundName(raw: string): string | null {
	let name = stripAsciiControls(raw.trim())
	name = name.replace(/\r\n|\r|\n/g, ' ')
	name = name.replace(/-{3,}/g, ' ')
	name = name.replace(/\s+/g, ' ').trim()
	name = name.replace(/[<>]/g, '')
	if (name.length > ETF_INFO_MAX_NAME_LENGTH) {
		name = name.slice(0, ETF_INFO_MAX_NAME_LENGTH).trimEnd()
	}
	if (name.length === 0) return null
	return name
}

/**
 * Ticker: uppercase, alphanumeric only, max length. Empty / invalid → undefined.
 */
export function sanitizeEtfInfoTicker(
	raw: string | undefined,
): string | undefined {
	if (raw === undefined) return undefined
	const compact = raw
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
	if (compact.length === 0) return undefined
	return compact.slice(0, ETF_INFO_MAX_TICKER_LENGTH)
}

/**
 * Catalog excerpt for the prompt: flatten whitespace, soften "---" runs, cap length.
 */
export function sanitizeEtfInfoCatalogLine(raw: string): string {
	let line = stripAsciiControls(raw)
	line = line.replace(/\r\n|\r|\n/g, ' ')
	line = line.replace(/-{3,}/g, '—')
	line = line.replace(/\s+/g, ' ').trim()
	if (line.length > ETF_INFO_MAX_CATALOG_LINE_LENGTH) {
		return `${line.slice(0, ETF_INFO_MAX_CATALOG_LINE_LENGTH)}…`
	}
	return line
}

export type SanitizedEtfInfoInputs = {
	name: string
	ticker: string | undefined
}

/**
 * Validates and normalizes client-supplied name and ticker before building the user message.
 */
export function sanitizeEtfInfoRequestInputs(params: {
	name: string
	ticker: string | undefined
}): SanitizedEtfInfoInputs | null {
	const name = sanitizeEtfInfoFundName(params.name)
	if (name === null) return null
	const ticker = sanitizeEtfInfoTicker(params.ticker)
	return { name, ticker }
}
