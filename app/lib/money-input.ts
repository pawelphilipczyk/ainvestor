/**
 * Shared money-style amount entry: HTML constraint validation and parsing
 * (locale-friendly separators, non-negative).
 */

/** HTML `pattern` (full value matched; implicit anchors). Same rules as {@link parseMoneyAmountString}. */
export const MONEY_AMOUNT_HTML_PATTERN = String.raw`(?=.*\d)[\d\s.,]+`

/**
 * Parse a user-entered money-like amount: spaces, thousand/decimal separators.
 * Returns null for empty or invalid or negative values.
 */
export function parseMoneyAmountString(raw: string): number | null {
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
	const n = Number.parseFloat(normalized)
	if (!Number.isFinite(n) || n < 0) return null
	return n
}
