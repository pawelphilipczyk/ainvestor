/**
 * Locale-friendly decimal entry for HTML forms: constraint validation and parsing
 * (spaces, thousand/decimal separators). Used for money amounts, percentages, and
 * other numeric fields that share `inputmode="decimal"` + the same `pattern`.
 */

/** HTML `pattern` (full value matched; implicit anchors). Same rules as {@link parseLocaleDecimalString}. */
export const LOCALE_DECIMAL_HTML_PATTERN = String.raw`(?=.*\d)[\d\s.,]+`

/** After thousand/decimal normalization, value must match this before {@link Number.parseFloat}. */
const NORMALIZED_LOCALE_DECIMAL_PATTERN = /^[+-]?\d+(?:[.,]\d+)?$/

/**
 * Parse a user-entered locale-style decimal: spaces, thousand/decimal separators.
 * Returns null for empty, invalid, or negative values.
 */
export function parseLocaleDecimalString(raw: string): number | null {
	const trimmed = raw.trim()
	if (!trimmed) return null
	const compact = trimmed.replace(/\s+/g, '')
	const hasComma = compact.includes(',')
	const hasDot = compact.includes('.')
	let normalized = compact
	if (hasComma && hasDot) {
		const lastComma = compact.lastIndexOf(',')
		const lastDot = compact.lastIndexOf('.')
		if (lastComma > lastDot) {
			normalized = compact.replace(/\./g, '').replace(',', '.')
		} else {
			normalized = compact.replace(/,/g, '')
		}
	} else if (hasComma && !hasDot) {
		const parts = compact.split(',')
		if (parts.length === 2 && parts[1].length <= 2 && parts[1].length > 0) {
			normalized = `${parts[0]}.${parts[1]}`
		} else {
			normalized = compact.replace(/,/g, '')
		}
	}
	if (!NORMALIZED_LOCALE_DECIMAL_PATTERN.test(normalized)) return null
	const forParse = normalized.replace(',', '.')
	const parsedNumber = Number.parseFloat(forParse)
	if (!Number.isFinite(parsedNumber) || parsedNumber < 0) return null
	return parsedNumber
}
