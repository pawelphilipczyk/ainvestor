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
import { minLength } from 'remix/data-schema/checks'
import { CURRENCIES } from '../../lib/currencies.ts'

const etfProposalRowSchema = object({
	name: string().pipe(minLength(1)),
	ticker: optional(string()),
	amount: optional(number()),
	currency: optional(enum_(CURRENCIES)),
	note: optional(string()),
})

const adviceBlockSchema = variant('type', {
	paragraph: object({
		type: literal('paragraph'),
		text: string().pipe(minLength(1)),
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
export type AdviceBlock = AdviceParagraphBlock | AdviceEtfProposalsBlock

export type AdviceDocument = {
	blocks: AdviceBlock[]
}

/**
 * Parse model output: valid JSON matching {@link AdviceDocumentSchema}, or a single paragraph fallback.
 */
export function parseAdviceDocument(raw: string | null): AdviceDocument {
	if (raw === null || raw.trim() === '') {
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
