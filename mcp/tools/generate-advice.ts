import { getOrCreateAdviceClient } from '../../app/features/advice/advice-client.ts'
import {
	type StoredAdviceAnalysis,
	saveStoredAdviceAnalysisForTab,
} from '../../app/features/advice/advice-gist.ts'
import type {
	AdviceAnalysisMode,
	AdviceModelId,
} from '../../app/features/advice/advice-openai.ts'
import {
	ADVICE_ANALYSIS_MODES,
	ADVICE_MODEL_IDS,
	DEFAULT_ADVICE_MODEL,
	getInvestmentAdvice,
} from '../../app/features/advice/advice-openai.ts'
import { fetchCatalog } from '../../app/features/catalog/lib.ts'
import { CURRENCIES } from '../../app/lib/currencies.ts'
import type { GistCredentials } from '../data-gist.ts'
import { resolveDataGistId } from '../data-gist.ts'
import {
	fetchEtfsCached,
	fetchGuidelinesOrThrowCached,
} from '../private-gist-cache.ts'
import type { McpToolDefinition, McpToolResult } from '../protocol.ts'
import { readCashAmountText, resolveCashCurrency } from './buy-plan.ts'
import { summarizePortfolio } from './portfolio.ts'
import {
	flattenAdviceDocumentToText,
	readAdviceAnalysisModeArgument,
} from './saved-advice.ts'
import { jsonResult } from './tool-result.ts'

const DESCRIPTION = `Generate a fresh written analysis by calling OpenAI, the same path the web app's advice page uses: "buy_next" (the default) proposes concrete fund purchases for a given amount of cash; "portfolio_review" is a qualitative health check of the holdings as they stand, with no purchases proposed.

**This costs money, per call** — it charges the OpenAI API using this server's own OPENAI_API_KEY. Reach for it only when the user explicitly asks for a written analysis with fund picks and prose. For a routine "what should I buy", use get_buy_plan instead: it answers with numbers alone, no API charge. For "what did the advice page last say", use get_saved_advice: it costs nothing and may already have what you need.

"buy_next" requires cashAmount, the same non-negative amount get_buy_plan takes; cashCurrency defaults to the currency the holdings already share. "portfolio_review" ignores both — the review reasons about the holdings as they are, not about a purchase.

By default this also **saves** the result to the gist, exactly as the web app's own Generate button does — overwriting whatever was saved there before for that mode (the gist keeps prior revisions, so it is restorable). Pass save: false to only get the text back without persisting it. A save failure is reported alongside the generated text rather than losing an analysis that already cost money to produce.`

export type GenerateAdviceSummary = {
	available: true
	mode: AdviceAnalysisMode
	model: AdviceModelId
	cashAmount?: string
	cashCurrency?: string
	cashCurrencySource?: 'argument' | 'holdings' | 'default'
	text: string
	saved: boolean
	savedAt?: number
	savePersistFailed?: string
	note: string
}

/** Present but the wrong type is a wrong argument, not an absent one — mirrors readAdviceAnalysisModeArgument. */
function readModel(toolArguments: Record<string, unknown>): AdviceModelId {
	const raw = toolArguments.model
	if (raw === undefined || raw === null) return DEFAULT_ADVICE_MODEL
	if (
		typeof raw !== 'string' ||
		!(ADVICE_MODEL_IDS as readonly string[]).includes(raw)
	) {
		throw new Error(
			`"model" must be one of: ${ADVICE_MODEL_IDS.join(', ')}; got ${JSON.stringify(raw)}.`,
		)
	}
	return raw as AdviceModelId
}

/** Defaults to true: the web app's own Generate button always saves, and this matches it. */
function readSave(toolArguments: Record<string, unknown>): boolean {
	const raw = toolArguments.save
	if (raw === undefined || raw === null) return true
	if (typeof raw !== 'boolean') {
		throw new Error(`"save" must be a boolean; got ${JSON.stringify(raw)}.`)
	}
	return raw
}

export function createGenerateAdviceTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const mode = readAdviceAnalysisModeArgument(toolArguments)
		const model = readModel(toolArguments)
		const save = readSave(toolArguments)
		const cashAmountText =
			mode === 'buy_next' ? readCashAmountText(toolArguments) : ''

		const gistId = await resolveDataGistId(credentials)
		const [holdings, catalog, guidelines] = await Promise.all([
			fetchEtfsCached(credentials.githubToken, gistId),
			fetchCatalog(),
			fetchGuidelinesOrThrowCached(credentials.githubToken, gistId),
		])

		const { currency: holdingsCurrency } = summarizePortfolio(holdings)
		// cashCurrency is unused for portfolio_review (getInvestmentAdvice never
		// reads it on that branch), so an argument is not resolved or validated
		// there either — the schema promises it is ignored, and resolving it
		// would throw on a bad value the caller was told does not matter.
		const { cashCurrency, cashCurrencySource } =
			mode === 'buy_next'
				? resolveCashCurrency({ toolArguments, holdingsCurrency })
				: {
						cashCurrency: holdingsCurrency ?? CURRENCIES[0],
						cashCurrencySource: 'default' as const,
					}

		const client = getOrCreateAdviceClient()
		const document = await getInvestmentAdvice({
			holdings,
			guidelines,
			cashAmount: cashAmountText,
			cashCurrency,
			catalog,
			client,
			model,
			analysisMode: mode,
		})

		const text = flattenAdviceDocumentToText(document)
		let saved = false
		let savedAt: number | undefined
		let savePersistFailed: string | undefined
		if (save) {
			const stored: StoredAdviceAnalysis = {
				version: 1,
				savedAt: Date.now(),
				lastAnalysisMode: mode,
				cashCurrency,
				...(mode === 'buy_next' ? { cashAmount: cashAmountText } : {}),
				selectedModel: model,
				activeTab: mode,
				document,
			}
			try {
				await saveStoredAdviceAnalysisForTab(
					credentials.githubToken,
					gistId,
					mode,
					stored,
				)
				saved = true
				savedAt = stored.savedAt
			} catch (error) {
				savePersistFailed =
					error instanceof Error ? error.message : String(error)
			}
		}

		return jsonResult({
			available: true,
			mode,
			model,
			...(mode === 'buy_next'
				? { cashAmount: cashAmountText, cashCurrency, cashCurrencySource }
				: {}),
			text,
			saved,
			...(savedAt !== undefined ? { savedAt } : {}),
			...(savePersistFailed !== undefined ? { savePersistFailed } : {}),
			note: saved
				? 'Written by this call, just now, and saved to the gist — get_saved_advice will return it until something overwrites it.'
				: savePersistFailed !== undefined
					? 'Written by this call, just now, but the gist save failed; the text below is not lost, only not persisted. Retry, or the analysis is gone once this response is.'
					: 'Written by this call, just now, and not saved — save: false was passed, so the analysis is gone once this response is.',
		} satisfies GenerateAdviceSummary)
	}

	return {
		name: 'generate_advice',
		title: 'Generate advice',
		description: DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				mode: {
					type: 'string',
					enum: [...ADVICE_ANALYSIS_MODES],
					description:
						'"buy_next" (default) for purchase proposals, or "portfolio_review" for a qualitative review.',
				},
				cashAmount: {
					type: 'string',
					description:
						'Cash to deploy, as a non-negative number. Required for "buy_next"; ignored for "portfolio_review". "1234.5" and "1 234,5" both work.',
				},
				cashCurrency: {
					type: 'string',
					enum: [...CURRENCIES],
					description:
						'Currency of that cash. Defaults to the currency the holdings are in, or PLN when the portfolio is empty. Ignored for "portfolio_review".',
				},
				model: {
					type: 'string',
					enum: [...ADVICE_MODEL_IDS],
					description: `OpenAI model to use. Defaults to ${DEFAULT_ADVICE_MODEL}, the balanced tier the web app defaults to; gpt-5.6-sol scores a little higher but costs noticeably more per call.`,
				},
				save: {
					type: 'boolean',
					description:
						"Persist the result to the gist, the way the web app's own Generate button does — overwriting whatever was saved there before for this mode. Defaults to true, matching the web app; pass false to only get the text back.",
				},
			},
		},
		handler,
	}
}
