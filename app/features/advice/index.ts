import { jsx } from 'remix/component/jsx-runtime'
import type { Issue } from 'remix/data-schema'
import { defaulted, enum_, object, parseSafe, string } from 'remix/data-schema'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { CURRENCIES } from '../../lib/currencies.ts'
import { objectFromFormData } from '../../lib/form-data-payload.ts'
import { fetchPortfolioSnapshot } from '../../lib/gist.ts'
import {
	clearGuestPortfolioReview,
	getGuestEtfs,
	getGuestGuidelines,
	getGuestPortfolioReview,
	setGuestPortfolioReview,
} from '../../lib/guest-session-state.ts'
import { fetchGuidelines } from '../../lib/guidelines.ts'
import { t } from '../../lib/i18n.ts'
import {
	clearPortfolioReviewFromGist,
	fetchPortfolioReviewFromGist,
	savePortfolioReviewToGist,
} from '../../lib/portfolio-review-gist.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import {
	getLayoutSession,
	getSessionData,
	type SessionData,
} from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { type CatalogEntry, fetchCatalog } from '../catalog/lib.ts'
import { getOrCreateAdviceClient } from './advice-client.ts'
import type { AdviceDocument } from './advice-document.ts'
import type { AdviceAnalysisMode, AdviceModelId } from './advice-openai.ts'
import {
	ADVICE_ANALYSIS_MODES,
	ADVICE_MODEL_IDS,
	DEFAULT_ADVICE_ANALYSIS_MODE,
	DEFAULT_ADVICE_MODEL,
	getInvestmentAdvice,
	normalizeAdviceAnalysisTab,
} from './advice-openai.ts'
import { AdvicePage } from './advice-page.tsx'

const ADVICE_INTENTS = ['run', 'clear'] as const

const AdviceSchema = object({
	cashAmount: string(),
	cashCurrency: defaulted(enum_(CURRENCIES), 'PLN'),
	adviceModel: defaulted(enum_(ADVICE_MODEL_IDS), DEFAULT_ADVICE_MODEL),
	analysisMode: defaulted(
		enum_(ADVICE_ANALYSIS_MODES),
		DEFAULT_ADVICE_ANALYSIS_MODE,
	),
	adviceIntent: defaulted(enum_(ADVICE_INTENTS), 'run'),
})

function parseAdviceTabParam(url: string): AdviceAnalysisMode {
	const tab = new URL(url).searchParams.get('tab')
	return normalizeAdviceAnalysisTab(tab)
}

function formatSchemaIssues(issues: ReadonlyArray<Issue>): string {
	return issues
		.map((issue) => {
			const path =
				issue.path && issue.path.length > 0 ? issue.path.join('.') : '(root)'
			return `${path}: ${issue.message}`
		})
		.join('\n')
}

function renderAdviceResponse(options: {
	session: SessionData | null
	props: {
		cashAmount?: string
		cashCurrency?: string
		analysisMode?: AdviceAnalysisMode
		/** Tab selected in the UI (`?tab=`); defaults to buy_next. */
		activeTab?: AdviceAnalysisMode
		/** Which analysis produced `advice` (for showing the result on the correct tab). */
		lastAnalysisMode?: AdviceAnalysisMode
		selectedModel?: AdviceModelId
		advice?: AdviceDocument
		/** Shared catalog snapshot for ETF detail links on proposal rows. */
		catalog?: CatalogEntry[]
		formError?: { summary: string; detail?: string }
		pendingApproval?: boolean
	}
	init?: ResponseInit
}) {
	return render({
		title: t('meta.title.advice'),
		session: options.session,
		currentPage: 'advice',
		body: jsx(AdvicePage, options.props),
		init: options.init,
	})
}

export { setAdviceClient } from './advice-client.ts'

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const adviceController = {
	actions: {
		async index(context: AppRequestContext) {
			const layoutSession = getLayoutSession(context.get(Session))
			const pendingApproval = layoutSession?.approvalStatus === 'pending'
			const activeTab = parseAdviceTabParam(context.request.url)
			const remixSession = context.get(Session)
			const fullSession = getSessionData(remixSession)

			if (!pendingApproval && activeTab === 'portfolio_review') {
				const catalog = await fetchCatalog()
				const stored =
					fullSession?.token && fullSession.gistId
						? await fetchPortfolioReviewFromGist(
								fullSession.token,
								fullSession.gistId,
							)
						: getGuestPortfolioReview(remixSession)
				if (stored !== null) {
					return renderAdviceResponse({
						session: layoutSession,
						props: {
							pendingApproval,
							analysisMode: DEFAULT_ADVICE_ANALYSIS_MODE,
							activeTab,
							catalog,
							advice: stored.advice,
							lastAnalysisMode: 'portfolio_review',
							selectedModel: stored.model,
						},
					})
				}
				return renderAdviceResponse({
					session: layoutSession,
					props: {
						pendingApproval,
						analysisMode: DEFAULT_ADVICE_ANALYSIS_MODE,
						activeTab,
						catalog,
					},
				})
			}

			return renderAdviceResponse({
				session: layoutSession,
				props: {
					pendingApproval,
					analysisMode: DEFAULT_ADVICE_ANALYSIS_MODE,
					activeTab,
				},
			})
		},

		async action(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			const layoutSession = getLayoutSession(context.get(Session))
			const pendingApproval = layoutSession?.approvalStatus === 'pending'
			const activeTabFromUrl = parseAdviceTabParam(context.request.url)
			const form = context.get(FormData)
			if (!form) {
				return renderAdviceResponse({
					session: layoutSession,
					props: {
						pendingApproval,
						analysisMode: DEFAULT_ADVICE_ANALYSIS_MODE,
						activeTab: activeTabFromUrl,
						formError: {
							summary: t('errors.advice.formRead'),
							detail: t('errors.advice.formReadDetail'),
						},
					},
					init: { status: 400 },
				})
			}

			const rawEntries = objectFromFormData(form)
			const formPayload = {
				...rawEntries,
				cashAmount:
					typeof rawEntries.cashAmount === 'string'
						? rawEntries.cashAmount
						: '',
				cashCurrency:
					typeof rawEntries.cashCurrency === 'string' &&
					rawEntries.cashCurrency.length > 0
						? rawEntries.cashCurrency
						: undefined,
				adviceModel:
					typeof rawEntries.adviceModel === 'string' &&
					rawEntries.adviceModel.length > 0
						? rawEntries.adviceModel
						: undefined,
				analysisMode:
					typeof rawEntries.analysisMode === 'string' &&
					rawEntries.analysisMode.length > 0
						? rawEntries.analysisMode
						: undefined,
				adviceIntent:
					typeof rawEntries.adviceIntent === 'string' &&
					rawEntries.adviceIntent.length > 0
						? rawEntries.adviceIntent
						: undefined,
			}
			const result = parseSafe(AdviceSchema, formPayload)
			if (!result.success) {
				const raw = form.get('cashAmount')
				const cashAmount =
					typeof raw === 'string' && raw.length > 0 ? raw : undefined
				const rawCur = form.get('cashCurrency')
				const cashCurrency =
					typeof rawCur === 'string' && rawCur.length > 0 ? rawCur : 'PLN'
				const rawModel = form.get('adviceModel')
				const selectedModel =
					typeof rawModel === 'string' &&
					rawModel.length > 0 &&
					(ADVICE_MODEL_IDS as readonly string[]).includes(rawModel)
						? (rawModel as AdviceModelId)
						: DEFAULT_ADVICE_MODEL
				const rawMode = form.get('analysisMode')
				const analysisMode =
					typeof rawMode === 'string' &&
					rawMode.length > 0 &&
					(ADVICE_ANALYSIS_MODES as readonly string[]).includes(rawMode)
						? (rawMode as AdviceAnalysisMode)
						: DEFAULT_ADVICE_ANALYSIS_MODE
				return renderAdviceResponse({
					session: layoutSession,
					props: {
						pendingApproval,
						cashAmount,
						cashCurrency,
						analysisMode,
						activeTab: activeTabFromUrl,
						selectedModel,
						formError: {
							summary: t('errors.advice.validation'),
							detail: formatSchemaIssues(result.issues),
						},
					},
					init: { status: 400 },
				})
			}
			const {
				cashAmount: rawCashAmount,
				cashCurrency,
				adviceModel,
				analysisMode,
				adviceIntent,
			} = result.value
			const trimmedCash = rawCashAmount.trim()
			if (analysisMode === 'buy_next' && trimmedCash === '') {
				return renderAdviceResponse({
					session: layoutSession,
					props: {
						pendingApproval,
						cashAmount: rawCashAmount,
						cashCurrency,
						analysisMode,
						activeTab: activeTabFromUrl,
						selectedModel: adviceModel,
						formError: {
							summary: t('errors.advice.buyNextCashRequired'),
						},
					},
					init: { status: 400 },
				})
			}
			const cashAmount = trimmedCash

			if (pendingApproval) {
				return renderAdviceResponse({
					session: layoutSession,
					props: {
						pendingApproval: true,
						cashAmount: rawCashAmount,
						cashCurrency,
						analysisMode,
						activeTab: activeTabFromUrl,
						selectedModel: adviceModel,
						formError: {
							summary: t('errors.advice.notApproved'),
						},
					},
					init: { status: 403 },
				})
			}

			if (analysisMode === 'portfolio_review' && adviceIntent === 'clear') {
				if (session?.token && session.gistId) {
					await clearPortfolioReviewFromGist(session.token, session.gistId)
				} else {
					clearGuestPortfolioReview(context.get(Session))
				}
				const catalog =
					activeTabFromUrl === 'portfolio_review'
						? await fetchCatalog()
						: undefined
				return renderAdviceResponse({
					session: layoutSession,
					props: {
						pendingApproval,
						analysisMode: DEFAULT_ADVICE_ANALYSIS_MODE,
						activeTab: activeTabFromUrl,
						selectedModel: adviceModel,
						...(catalog !== undefined ? { catalog } : {}),
					},
				})
			}

			try {
				const { catalog, entries } =
					session?.gistId && session.token
						? await fetchPortfolioSnapshot(session.token, session.gistId)
						: {
								catalog: await fetchCatalog(),
								entries: getGuestEtfs(context.get(Session)),
							}
				const guidelines =
					session?.gistId && session.token
						? await fetchGuidelines(session.token, session.gistId)
						: getGuestGuidelines(context.get(Session))

				const client = getOrCreateAdviceClient()
				const advice = await getInvestmentAdvice({
					holdings: entries,
					guidelines,
					cashAmount,
					cashCurrency,
					catalog,
					client,
					model: adviceModel,
					analysisMode,
				})
				if (analysisMode === 'portfolio_review') {
					if (session?.token && session.gistId) {
						await savePortfolioReviewToGist({
							token: session.token,
							gistId: session.gistId,
							stored: { advice, model: adviceModel },
						})
					} else {
						setGuestPortfolioReview(context.get(Session), {
							advice,
							model: adviceModel,
						})
					}
				}
				return renderAdviceResponse({
					session: layoutSession,
					props: {
						pendingApproval,
						...(analysisMode === 'portfolio_review'
							? {}
							: { cashAmount, cashCurrency }),
						analysisMode,
						activeTab: activeTabFromUrl,
						lastAnalysisMode: analysisMode,
						selectedModel: adviceModel,
						advice,
						catalog,
					},
				})
			} catch (err) {
				console.error('[advice] request failed', err)
				const exposeStack = process.env.NODE_ENV !== 'production'
				const detail =
					err instanceof Error
						? exposeStack
							? `${err.message}\n${err.stack ?? ''}`.trim()
							: err.message
						: String(err)
				return renderAdviceResponse({
					session: layoutSession,
					props: {
						pendingApproval,
						...(analysisMode === 'portfolio_review'
							? {}
							: { cashAmount, cashCurrency }),
						analysisMode,
						activeTab: activeTabFromUrl,
						lastAnalysisMode: analysisMode,
						selectedModel: adviceModel,
						formError: {
							summary: t('errors.advice.service'),
							detail,
						},
					},
					init: { status: 503 },
				})
			}
		},
	},
}

/** Test helper: path + query for switching to a tab. */
export function adviceTabHref(mode: AdviceAnalysisMode): string {
	const tabQuery = mode === 'portfolio_review' ? 'portfolio_review' : 'buy_next'
	return routes.advice.index.href({}, { tab: tabQuery })
}
