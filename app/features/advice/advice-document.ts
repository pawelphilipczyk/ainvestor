import type { InferOutput } from 'remix/data-schema'
import {
	array,
	enum_,
	literal,
	number,
	object,
	optional,
	parseSafe,
	string,
	variant,
} from 'remix/data-schema'
import { max, min, minLength } from 'remix/data-schema/checks'
import { CURRENCIES } from '../../lib/currencies.ts'

const etfProposalRowSchema = object({
	name: string().pipe(minLength(1)),
	ticker: optional(string()),
	/** Stable catalog row id when known (for ETF detail links). */
	catalogEntryId: optional(string()),
	amount: optional(number()),
	currency: optional(enum_(CURRENCIES)),
	note: optional(string()),
})

const capitalSegmentRoleSchema = enum_(['holdings', 'cash'] as const)

const capitalSnapshotSegmentSchema = object({
	role: capitalSegmentRoleSchema,
	label: string().pipe(minLength(1)),
	amount: number().pipe(min(0)),
	currency: enum_(CURRENCIES),
})

const capitalSnapshotPostTotalSchema = object({
	label: string().pipe(minLength(1)),
	amount: number().pipe(min(0)),
	currency: enum_(CURRENCIES),
})

const guidelineBarRowSchema = object({
	label: string().pipe(minLength(1)),
	targetPct: number().pipe(min(0), max(100)),
	currentPct: number().pipe(min(0), max(100)),
	postBuyPct: optional(number().pipe(min(0), max(100))),
})

const adviceBlockSchema = variant('type', {
	paragraph: object({
		type: literal('paragraph'),
		text: string().pipe(minLength(1)),
	}),
	capital_snapshot: object({
		type: literal('capital_snapshot'),
		segments: array(capitalSnapshotSegmentSchema).refine(
			(s) => s.length > 0,
			'At least one segment',
		),
		postTotal: optional(capitalSnapshotPostTotalSchema),
	})
		.refine((block) => {
			// Check role uniqueness
			const roles = block.segments.map((s) => s.role)
			const uniqueRoles = new Set(roles)
			if (roles.length !== uniqueRoles.size) {
				return false
			}
			return true
		}, 'Segment roles must be unique')
		.refine((block) => {
			// Check currency consistency
			if (block.segments.length === 0) return true
			const firstCurrency = block.segments[0].currency
			// All segments must have the same currency
			if (!block.segments.every((s) => s.currency === firstCurrency)) {
				return false
			}
			// If postTotal exists, it must match the segment currency
			if (block.postTotal && block.postTotal.currency !== firstCurrency) {
				return false
			}
			return true
		}, 'All currencies must match')
		.refine((block) => {
			// Check postTotal amount if present
			if (!block.postTotal) return true
			const segmentSum = block.segments.reduce((sum, s) => sum + s.amount, 0)
			// postTotal.amount should equal or be >= sum of segment amounts
			// Using a small epsilon for floating point comparison
			const epsilon = 0.000001
			if (block.postTotal.amount + epsilon < segmentSum) {
				return false
			}
			return true
		}, 'postTotal amount must be >= sum of segment amounts'),
	guideline_bars: object({
		type: literal('guideline_bars'),
		caption: optional(string()),
		rows: array(guidelineBarRowSchema),
	}),
	etf_proposals: object({
		type: literal('etf_proposals'),
		caption: optional(string()),
		rows: array(etfProposalRowSchema),
	}),
})

export const AdviceDocumentSchema = object({
	blocks: array(adviceBlockSchema).refine(
		(blocks) => blocks.length > 0,
		'At least one block',
	),
})

/** Explicit union so `type` narrows (variant inference widens `type` to `string`). */
export type AdviceParagraphBlock = {
	type: 'paragraph'
	text: string
}
export type AdviceEtfProposalRow = InferOutput<typeof etfProposalRowSchema>
export type AdviceEtfProposalsBlock = {
	type: 'etf_proposals'
	caption?: string
	rows: AdviceEtfProposalRow[]
}
export type AdviceCapitalSnapshotSegment = InferOutput<
	typeof capitalSnapshotSegmentSchema
>
export type AdviceCapitalSnapshotBlock = {
	type: 'capital_snapshot'
	segments: AdviceCapitalSnapshotSegment[]
	postTotal?: InferOutput<typeof capitalSnapshotPostTotalSchema>
}
export type AdviceGuidelineBarRow = InferOutput<typeof guidelineBarRowSchema>
export type AdviceGuidelineBarsBlock = {
	type: 'guideline_bars'
	caption?: string
	rows: AdviceGuidelineBarRow[]
}
export type AdviceBlock =
	| AdviceParagraphBlock
	| AdviceCapitalSnapshotBlock
	| AdviceGuidelineBarsBlock
	| AdviceEtfProposalsBlock

export type AdviceDocument = {
	blocks: AdviceBlock[]
}

/**
 * Parse model output: valid JSON matching {@link AdviceDocumentSchema}, or a single paragraph fallback.
 * Treats `null` and `undefined` like empty (e.g. missing `choices[0]` from the API).
 */
export function parseAdviceDocument(
	raw: string | null | undefined,
): AdviceDocument {
	if (raw == null || raw.trim() === '') {
		return { blocks: [{ type: 'paragraph', text: 'No advice available.' }] }
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return { blocks: [{ type: 'paragraph', text: raw }] }
	}
	const result = parseSafe(AdviceDocumentSchema, parsed)
	if (!result.success) {
		return { blocks: [{ type: 'paragraph', text: raw }] }
	}
	return result.value as AdviceDocument
}
