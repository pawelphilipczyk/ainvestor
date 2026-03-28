import { jsx } from 'remix/component/jsx-runtime'
import type { Issue } from 'remix/data-schema'
import { defaulted, enum_, object, parseSafe, string } from 'remix/data-schema'
import type { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { CURRENCIES } from '../../lib/currencies.ts'
import { objectFromFormData } from '../../lib/form-data-payload.ts'
import { fetchPortfolioSnapshot } from '../../lib/gist.ts'
import {
	getGuestCatalog,
	getGuestEtfs,
	getGuestGuidelines,
} from '../../lib/guest-session-state.ts'
import { fetchGuidelines } from '../../lib/guidelines.ts'
import { t } from '../../lib/i18n.ts'
import {
	getLayoutSession,
	getSessionData,
	type SessionData,
} from '../../lib/session.ts'
import type {
	AdviceAnalysisMode,
	AdviceClient,
	AdviceModelId,
} from '../../openai.ts'
import {
	ADVICE_ANALYSIS_MODES,
	ADVICE_MODEL_IDS,
	createDefaultClient,
	DEFAULT_ADVICE_ANALYSIS_MODE,
	DEFAULT_ADVICE_MODEL,
	getInvestmentAdvice,
	normalizeAdviceAnalysisTab,
} from '../../openai.ts'
import { routes } from '../../routes.ts'
import type { AdviceDocument } from './advice-document.ts'
import { AdvicePage } from './advice-page.tsx'

const AdviceSchema = object({
	cashAmount: string(),
	cashCurrency: defaulted(enum_(CURRENCIES), 'PLN'),
	adviceModel: defaulted(enum_(ADVICE_MODEL_IDS), DEFAULT_ADVICE_MODEL),
	analysisMode: defaulted(
		enum_(ADVICE_ANALYSIS_MODES),
		DEFAULT_ADVICE_ANALYSIS_MODE,
	),
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

// ---------------------------------------------------------------------------
// Advice client (injectable for tests)
// ---------------------------------------------------------------------------
let adviceClient: AdviceClient | null = null

export function setAdviceClient(client: AdviceClient | null) {
	adviceClient = client
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const adviceController = {
	async index(context: { request: Request; session: Session }) {
		const layoutSession = getLayoutSession(context.session)
		const pendingApproval = layoutSession?.approvalStatus === 'pending'
		const activeTab = parseAdviceTabParam(context.request.url)
		return renderAdviceResponse({
			session: layoutSession,
			props: {
				pendingApproval,
				analysisMode: DEFAULT_ADVICE_ANALYSIS_MODE,
				activeTab,
			},
		})
	},

	async action(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const session = getSessionData(context.session)
		const layoutSession = getLayoutSession(context.session)
		const pendingApproval = layoutSession?.approvalStatus === 'pending'
		const activeTabFromUrl = parseAdviceTabParam(context.request.url)
		const form = context.formData
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
				typeof rawEntries.cashAmount === 'string' ? rawEntries.cashAmount : '',
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

		const { entries, catalog } =
			session?.gistId && session.token
				? await fetchPortfolioSnapshot(session.token, session.gistId)
				: {
						entries: getGuestEtfs(context.session),
						catalog: getGuestCatalog(context.session),
					}
		const guidelines =
			session?.gistId && session.token
				? await fetchGuidelines(session.token, session.gistId)
				: getGuestGuidelines(context.session)

		try {
			const client = adviceClient ?? createDefaultClient()
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
			return renderAdviceResponse({
				session: layoutSession,
				props: {
					pendingApproval,
					cashAmount,
					cashCurrency,
					analysisMode,
					activeTab: activeTabFromUrl,
					lastAnalysisMode: analysisMode,
					selectedModel: adviceModel,
					advice,
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
					cashAmount,
					cashCurrency,
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
}

/** Test helper: path + query for switching to a tab. */
export function adviceTabHref(mode: AdviceAnalysisMode): string {
	const q = mode === 'portfolio_review' ? 'portfolio_review' : 'buy_next'
	return routes.advice.index.href({}, { tab: q })
}
