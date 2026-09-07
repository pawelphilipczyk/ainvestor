import type {
	AdviceBlock,
	AdviceDocument,
} from '../../app/features/advice/advice-document.ts'
import type { StoredAdviceAnalysis } from '../../app/features/advice/advice-gist.ts'
import { fetchStoredAdviceAnalysisOutcomeForTab } from '../../app/features/advice/advice-gist.ts'
import type { AdviceAnalysisMode } from '../../app/features/advice/advice-openai.ts'
import {
	ADVICE_ANALYSIS_MODES,
	normalizeAdviceAnalysisTab,
} from '../../app/features/advice/advice-openai.ts'
import type { GistCredentials } from '../data-gist.ts'
import { resolveDataGistId } from '../data-gist.ts'
import type { McpToolDefinition, McpToolResult } from '../protocol.ts'
import { roundToTwoDecimals } from './rounding.ts'
import { readStringArgument } from './tool-arguments.ts'
import { jsonResult } from './tool-result.ts'

const DESCRIPTION = `Read the written analysis the web app's advice page last saved, in either of its two modes: "buy_next" (what to buy with a given amount of cash) or "portfolio_review" (a qualitative review of the portfolio as it stands).

This is a stored snapshot, not a fresh answer. It was written by a language model at some past moment against the data of that moment, and nothing recomputes it: the holdings, the targets and the catalog may all have moved since. The saved timestamp and the cash amount it was written for are reported alongside it — read them before repeating any figure it contains, and use get_portfolio, get_guidelines and get_buy_plan for numbers that are current.

This server does not generate advice; only the web app does. When nothing is saved, the answer says so rather than inventing an analysis.`

/** What the tool answers with when there is nothing to show. */
export type SavedAdviceBlocker = 'not_found' | 'malformed'

export type SavedAdviceSummary =
	| {
			available: true
			mode: AdviceAnalysisMode
			savedAt: number
			savedAtIso: string | null
			model: string
			cashAmount?: string
			cashCurrency: string
			text: string
			note: string
	  }
	| {
			available: false
			mode: AdviceAnalysisMode
			blocker: SavedAdviceBlocker
			reason: string
	  }

function formatAmount(params: { amount: number; currency: string }): string {
	return `${roundToTwoDecimals(params.amount)} ${params.currency}`
}

function formatPercent(value: number): string {
	return `${roundToTwoDecimals(value)}%`
}

function headedList(params: { heading: string; lines: string[] }): string {
	const { heading, lines } = params
	if (lines.length === 0) return `${heading}\n- (none)`
	return [heading, ...lines.map((line) => `- ${line}`)].join('\n')
}

function captionedHeading(params: {
	heading: string
	caption: string | undefined
}): string {
	const { heading, caption } = params
	return caption === undefined || caption.trim() === ''
		? `${heading}:`
		: `${heading} — ${caption.trim()}:`
}

/**
 * One block as prose. The stored document is a rendering structure for the
 * advice page's JSX; handed over raw it costs a model more attention to decode
 * than the sentences inside it are worth, so each block becomes the lines a
 * reader would have seen.
 */
function flattenAdviceBlock(block: AdviceBlock): string {
	switch (block.type) {
		case 'paragraph':
			return block.text
		case 'capital_snapshot': {
			const lines = block.segments.map(
				(segment) =>
					`${segment.label}: ${formatAmount({ amount: segment.amount, currency: segment.currency })}`,
			)
			const total = block.postTotal
			return headedList({
				heading: 'Capital:',
				lines:
					total === undefined
						? lines
						: [
								...lines,
								`${total.label}: ${formatAmount({ amount: total.amount, currency: total.currency })}`,
							],
			})
		}
		case 'guideline_bars':
			return headedList({
				heading: captionedHeading({
					heading: 'Targets',
					caption: block.caption,
				}),
				lines: block.rows.map((row) => {
					const postBuy =
						row.postBuyPct === undefined
							? ''
							: `, after buying ${formatPercent(row.postBuyPct)}`
					return `${row.label}: target ${formatPercent(row.targetPct)}, now ${formatPercent(row.currentPct)}${postBuy}`
				}),
			})
		case 'etf_proposals':
			return headedList({
				heading: captionedHeading({
					heading: 'Proposed purchases',
					caption: block.caption,
				}),
				lines: block.rows.map((row) => {
					const ticker = row.ticker === undefined ? '' : ` (${row.ticker})`
					const amount =
						row.amount === undefined
							? ''
							: `: ${formatAmount({ amount: row.amount, currency: row.currency ?? '' })}`.trimEnd()
					const note = row.note === undefined ? '' : ` — ${row.note}`
					return `${row.name}${ticker}${amount}${note}`
				}),
			})
	}
}

/** The whole stored document as text, blocks separated by a blank line. */
export function flattenAdviceDocumentToText(document: AdviceDocument): string {
	return document.blocks.map(flattenAdviceBlock).join('\n\n')
}

function savedAtIso(savedAt: number): string | null {
	if (!Number.isFinite(savedAt)) return null
	const date = new Date(savedAt)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function summarizeSavedAdvice(params: {
	mode: AdviceAnalysisMode
	stored: StoredAdviceAnalysis
}): SavedAdviceSummary {
	const { mode, stored } = params
	return {
		available: true,
		mode,
		savedAt: stored.savedAt,
		savedAtIso: savedAtIso(stored.savedAt),
		model: stored.selectedModel,
		...(stored.cashAmount === undefined || stored.cashAmount.trim() === ''
			? {}
			: { cashAmount: stored.cashAmount }),
		cashCurrency: stored.cashCurrency,
		text: flattenAdviceDocumentToText(stored.document),
		note: 'A stored snapshot written by a language model at savedAt, against the data of that moment. Nothing has recomputed it since; check the current figures before repeating any of them.',
	}
}

function describeMode(mode: AdviceAnalysisMode): string {
	return mode === 'buy_next' ? 'buy-next' : 'portfolio-review'
}

export function blockedSavedAdvice(params: {
	mode: AdviceAnalysisMode
	blocker: SavedAdviceBlocker
}): SavedAdviceSummary {
	const { mode, blocker } = params
	return {
		available: false,
		mode,
		blocker,
		reason:
			blocker === 'not_found'
				? `No ${describeMode(mode)} analysis has been saved. The web app's advice page writes one when advice is generated there; this server cannot generate one. Answer from get_portfolio, get_guidelines and get_buy_plan instead.`
				: `A saved ${describeMode(mode)} analysis exists in the gist, but its JSON does not match the format this app stores, so nothing can be read from it. Generating the advice again in the web app overwrites the file.`,
	}
}

/**
 * Unlike `normalizeAdviceAnalysisTab`, which silently turns anything unknown
 * into the default, a mode the caller actually named and got wrong is refused:
 * quietly answering with the buy-next analysis to a request for the review is
 * worse than saying the argument is wrong.
 */
function readMode(toolArguments: Record<string, unknown>): AdviceAnalysisMode {
	const raw = readStringArgument(toolArguments, 'mode')
	if (raw === null) return normalizeAdviceAnalysisTab(null)
	if (raw !== 'buy_next' && raw !== 'portfolio_review') {
		throw new Error(
			`"mode" must be one of: ${ADVICE_ANALYSIS_MODES.join(', ')}; got "${raw}".`,
		)
	}
	return raw
}

export function createGetSavedAdviceTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const mode = readMode(toolArguments)
		const gistId = await resolveDataGistId(credentials)
		const outcome = await fetchStoredAdviceAnalysisOutcomeForTab(
			credentials.githubToken,
			gistId,
			mode,
		)
		if (outcome.status === 'unreadable') {
			// A rejected read is a failure of the call, not an answer about the data:
			// thrown, it reaches an HTTP client as a 401 when the token is the
			// problem, which is what teaches the client to refresh it.
			throw new Error(
				`GitHub API error fetching the advice gist: ${outcome.httpStatus}`,
			)
		}
		if (outcome.status !== 'found') {
			return jsonResult(blockedSavedAdvice({ mode, blocker: outcome.status }))
		}
		return jsonResult(summarizeSavedAdvice({ mode, stored: outcome.stored }))
	}

	return {
		name: 'get_saved_advice',
		title: 'Get saved advice',
		description: DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				mode: {
					type: 'string',
					enum: [...ADVICE_ANALYSIS_MODES],
					description:
						'Which stored analysis to read: "buy_next" (default) or "portfolio_review".',
				},
			},
		},
		handler,
	}
}
