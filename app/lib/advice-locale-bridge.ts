import type { AdviceGuidelineBarRow } from '../features/advice/advice-document.ts'
import { ETF_TYPE_LABELS } from '../locales/en.ts'
import { ETF_TYPE_LABELS_PL } from '../locales/pl.ts'
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
 * Cached advice (gist) may contain bucket names from a prior UI language. Rewrites known
 * ETF class words so prose matches the active locale without re-running the model.
 */
export function localizeEtfBucketTermsInAdviceProse(text: string): string {
	const locale = getUiLocale()
	if (text.length === 0) return text
	let out = text
	const rows = ETF_TYPES.map((type) => ({
		en: ETF_TYPE_LABELS[type],
		pl: ETF_TYPE_LABELS_PL[type],
	}))
	if (locale === 'en') {
		const byPlLen = [...rows].sort((a, b) => b.pl.length - a.pl.length)
		for (const { en, pl } of byPlLen) {
			out = out.replace(new RegExp(escapeRegExp(pl), 'gi'), en)
		}
		return out
	}
	const multi = [...rows]
		.filter((r) => r.en.includes(' '))
		.sort((a, b) => b.en.length - a.en.length)
	for (const { en, pl } of multi) {
		out = out.replace(new RegExp(escapeRegExp(en), 'gi'), pl)
	}
	const singles = [...rows]
		.filter((r) => !r.en.includes(' '))
		.sort((a, b) => b.en.length - a.en.length)
	for (const { en, pl } of singles) {
		out = out.replace(new RegExp(`\\b${escapeRegExp(en)}\\b`, 'gi'), pl)
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
