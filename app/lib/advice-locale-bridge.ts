import type { AdviceGuidelineBarRow } from '../features/advice/advice-document.ts'
import { ETF_TYPE_LABELS } from '../locales/en.ts'
import { ETF_TYPE_LABELS_PL } from '../locales/pl.ts'
import type { EtfType } from './etf-type.ts'
import { ETF_TYPES } from './etf-type.ts'
import {
	formatEtfTypeLabel,
	resolveEtfTypeFromAdviceBucketLabel,
} from './guidelines.ts'
import { getUiLocale } from './ui-locale.ts'

function escapeRegExp(value: string): string {
	return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

/**
 * "mixed"/"Mieszany" reads as an everyday adjective ("results were mixed") at least as often
 * as an asset-class name, so a blind regex sweep over free-form prose is too likely to corrupt
 * unrelated sentences. Excluded here only — exact-label matching in
 * getAdviceGuidelineBarRowDisplayLabel compares whole trimmed labels, not prose substrings, so
 * it stays unaffected and still resolves "mixed" rows correctly.
 */
const PROSE_SWEEP_EXCLUDED_TYPES: ReadonlySet<EtfType> = new Set(['mixed'])

/**
 * Cached advice (gist) may contain bucket names from a prior UI language. Rewrites known
 * ETF class words so prose matches the active locale without re-running the model.
 */
export function localizeEtfBucketTermsInAdviceProse(text: string): string {
	const locale = getUiLocale()
	if (text.length === 0) return text
	const rows = ETF_TYPES.filter(
		(type) => !PROSE_SWEEP_EXCLUDED_TYPES.has(type),
	).map((type) => ({
		en: ETF_TYPE_LABELS[type],
		pl: ETF_TYPE_LABELS_PL[type],
	}))
	let out = text
	const source = locale === 'en' ? 'pl' : 'en'
	const bySourceLenDesc = [...rows].sort(
		(a, b) => b[source].length - a[source].length,
	)
	for (const { en, pl } of bySourceLenDesc) {
		const [needle, replacement] = locale === 'en' ? [pl, en] : [en, pl]
		out = out.replace(
			new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'gi'),
			replacement,
		)
	}
	return out
}

export function getAdviceGuidelineBarRowDisplayLabel(
	row: AdviceGuidelineBarRow,
): string {
	if (row.etfType !== undefined) {
		return formatEtfTypeLabel(row.etfType)
	}
	const inferred = resolveEtfTypeFromAdviceBucketLabel(row.label)
	if (inferred !== undefined) {
		return formatEtfTypeLabel(inferred)
	}
	return row.label
}
