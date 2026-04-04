/**
 * Lightweight structural validation for advice documents read from localStorage.
 * Ensures we only render with textContent (no stored HTML); rejects unexpected shapes.
 */

/** Keep in sync with `app/lib/currencies.ts`. */
const CURRENCIES = new Set([
	'PLN',
	'USD',
	'EUR',
	'GBP',
	'CHF',
	'JPY',
	'CAD',
	'AUD',
	'SEK',
	'NOK',
])

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
	return typeof value === 'string' && value.length > 0
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isNonNegativeNumber(value) {
	return typeof value === 'number' && !Number.isNaN(value) && value >= 0
}

/**
 * @param {unknown} block
 * @returns {boolean}
 */
function isValidBlock(block) {
	if (block == null || typeof block !== 'object') return false
	const type = /** @type {{ type?: unknown }} */ (block).type
	if (type === 'paragraph') {
		const text = /** @type {{ text?: unknown }} */ (block).text
		return isNonEmptyString(text)
	}
	if (type === 'capital_snapshot') {
		const segments = /** @type {{ segments?: unknown }} */ (block).segments
		if (!Array.isArray(segments) || segments.length === 0) return false
		let firstCurrency = null
		const roles = new Set()
		for (const seg of segments) {
			if (seg == null || typeof seg !== 'object') return false
			const s =
				/** @type {{ role?: unknown; label?: unknown; amount?: unknown; currency?: unknown }} */ (
					seg
				)
			if (s.role !== 'holdings' && s.role !== 'cash') return false
			if (roles.has(s.role)) return false
			roles.add(s.role)
			if (!isNonEmptyString(s.label)) return false
			if (!isNonNegativeNumber(s.amount)) return false
			if (typeof s.currency !== 'string' || !CURRENCIES.has(s.currency))
				return false
			if (firstCurrency === null) firstCurrency = s.currency
			else if (s.currency !== firstCurrency) return false
		}
		const postTotal = /** @type {{ postTotal?: unknown }} */ (block).postTotal
		if (postTotal !== undefined) {
			if (postTotal == null || typeof postTotal !== 'object') return false
			const pt =
				/** @type {{ label?: unknown; amount?: unknown; currency?: unknown }} */ (
					postTotal
				)
			if (!isNonEmptyString(pt.label)) return false
			if (!isNonNegativeNumber(pt.amount)) return false
			if (typeof pt.currency !== 'string' || pt.currency !== firstCurrency)
				return false
		}
		return true
	}
	if (type === 'guideline_bars') {
		const rows = /** @type {{ rows?: unknown }} */ (block).rows
		if (!Array.isArray(rows)) return false
		for (const row of rows) {
			if (row == null || typeof row !== 'object') return false
			const r =
				/** @type {{ label?: unknown; targetPct?: unknown; currentPct?: unknown; postBuyPct?: unknown }} */ (
					row
				)
			if (!isNonEmptyString(r.label)) return false
			if (!isNonNegativeNumber(r.targetPct) || r.targetPct > 100) return false
			if (!isNonNegativeNumber(r.currentPct) || r.currentPct > 100) return false
			if (r.postBuyPct !== undefined) {
				if (!isNonNegativeNumber(r.postBuyPct) || r.postBuyPct > 100)
					return false
			}
		}
		return true
	}
	if (type === 'etf_proposals') {
		const rows = /** @type {{ rows?: unknown }} */ (block).rows
		if (!Array.isArray(rows)) return false
		for (const row of rows) {
			if (row == null || typeof row !== 'object') return false
			const r = /** @type {{ name?: unknown }} */ (row)
			if (!isNonEmptyString(r.name)) return false
		}
		return true
	}
	return false
}

/**
 * @param {unknown} value
 * @returns {{ blocks: unknown[] } | null}
 */
export function validateAdviceDocumentForClientStorage(value) {
	if (value == null || typeof value !== 'object') return null
	const blocks = /** @type {{ blocks?: unknown }} */ (value).blocks
	if (!Array.isArray(blocks) || blocks.length === 0) return null
	for (const block of blocks) {
		if (!isValidBlock(block)) return null
	}
	return /** @type {{ blocks: unknown[] }} */ (value)
}
