import type { InferOutput } from 'remix/data-schema'
import {
	array,
	literal,
	number,
	object,
	optional,
	parseSafe,
	string,
	variant,
} from 'remix/data-schema'
import { minLength } from 'remix/data-schema/checks'

const etfProposalRowSchema = object({
	name: string().pipe(minLength(1)),
	ticker: optional(string()),
	amountUsd: optional(number()),
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
	blocks: array(adviceBlockSchema).pipe(minLength(1)),
})

export type AdviceDocument = InferOutput<typeof AdviceDocumentSchema>
export type AdviceBlock = InferOutput<typeof adviceBlockSchema>

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
	return result.value
}
