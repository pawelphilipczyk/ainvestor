/**
 * Legacy gist file `portfolio-review.json` (read + clear only). New analyses are
 * stored in `advice-analysis.json` (`app/features/advice/advice-gist.ts`).
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

const GITHUB_API = 'https://api.github.com'

function githubHeaders(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': '2022-11-28',
	}
}

export async function fetchPortfolioReviewFromGist(
	token: string,
	gistId: string,
): Promise<StoredPortfolioReview | null> {
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		headers: githubHeaders(token),
	})
	if (!response.ok) return null
	const gist = (await response.json()) as GistPayload
	return parsePortfolioReviewFromGist(gist)
}

export async function clearPortfolioReviewFromGist(
	token: string,
	gistId: string,
): Promise<void> {
	const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
		method: 'PATCH',
		headers: githubHeaders(token),
		body: JSON.stringify(buildClearPortfolioReviewGistPatch()),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error clearing portfolio review file: ${response.status}`,
		)
	}
}
