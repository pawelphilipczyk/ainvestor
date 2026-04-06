/**
 * Parse helpers for legacy gist file `portfolio-review.json`. New analyses are
 * stored in `advice-analysis.json` (`app/features/advice/advice-gist.ts`).
 * Network read/clear helpers were removed; the app no longer loads this file.
 */
import { parseSafe } from 'remix/data-schema'

import type { AdviceDocument } from '../features/advice/advice-document.ts'
import { AdviceDocumentSchema } from '../features/advice/advice-document.ts'
import type { AdviceModelId } from '../features/advice/advice-openai.ts'
import {
	ADVICE_MODEL_IDS,
	DEFAULT_ADVICE_MODEL,
} from '../features/advice/advice-openai.ts'

export const PORTFOLIO_REVIEW_FILENAME = 'portfolio-review.json'

export type StoredPortfolioReview = {
	advice: AdviceDocument
	model: AdviceModelId
}

type GistFile = {
	content: string | null
}

type GistPayload = {
	files: Record<string, GistFile>
}

function normalizeModel(raw: unknown): AdviceModelId {
	if (
		typeof raw === 'string' &&
		(ADVICE_MODEL_IDS as readonly string[]).includes(raw)
	) {
		return raw as AdviceModelId
	}
	return DEFAULT_ADVICE_MODEL
}

/** Parse stored portfolio review from a gist API `files` payload. */
export function parsePortfolioReviewFromGist(
	gist: GistPayload,
): StoredPortfolioReview | null {
	const file = gist.files[PORTFOLIO_REVIEW_FILENAME]
	if (!file?.content || file.content.trim() === '') return null
	let parsed: unknown
	try {
		parsed = JSON.parse(file.content)
	} catch {
		return null
	}
	if (parsed === null || typeof parsed !== 'object') return null
	const asRecord = parsed as Record<string, unknown>
	if ('advice' in asRecord) {
		const inner = asRecord.advice
		const model = normalizeModel(asRecord.model)
		const docResult = parseSafe(AdviceDocumentSchema, inner)
		if (!docResult.success) return null
		return { advice: docResult.value as AdviceDocument, model }
	}
	const legacy = parseSafe(AdviceDocumentSchema, parsed)
	if (!legacy.success) return null
	return { advice: legacy.value as AdviceDocument, model: DEFAULT_ADVICE_MODEL }
}

/** PATCH body: remove the portfolio review file from the gist. */
export function buildClearPortfolioReviewGistPatch(): {
	files: Record<string, null>
} {
	return {
		files: {
			[PORTFOLIO_REVIEW_FILENAME]: null,
		},
	}
}
