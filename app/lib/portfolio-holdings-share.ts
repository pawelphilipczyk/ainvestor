import type { EtfEntry } from './gist.ts'
import { clampGuidelineBarWidthPercent } from './guidelines.ts'

/**
 * Sum of holding values when every row uses the same currency; otherwise `null`
 * (mixed-currency portfolios cannot define one total for percentage bars).
 */
export function totalHoldingsValueForShareBars(
	entries: EtfEntry[],
): number | null {
	if (entries.length === 0) {
		return null
	}
	const currency = entries[0].currency
	for (const entry of entries) {
		if (entry.currency !== currency) {
			return null
		}
	}
	let total = 0
	for (const entry of entries) {
		total += Number.isFinite(entry.value) ? entry.value : 0
	}
	return total
}

/** Share of a single holding as 0–100 for bar width and labels; `total` must be positive. */
export function valueShareOfHoldingsTotalPercent(params: {
	value: number
	total: number
}): number {
	const { value, total } = params
	if (!Number.isFinite(total) || total <= 0) {
		return 0
	}
	const finiteValue = Number.isFinite(value) ? value : 0
	return clampGuidelineBarWidthPercent((100 * finiteValue) / total)
}
