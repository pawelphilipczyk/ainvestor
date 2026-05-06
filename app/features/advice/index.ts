import { jsx } from 'remix/component/jsx-runtime'
import { renderToStream } from 'remix/component/server'
import type { Issue } from 'remix/data-schema'
import { defaulted, enum_, object, parseSafe, string } from 'remix/data-schema'
import { createHtmlResponse } from 'remix/response/html'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { CURRENCIES } from '../../lib/currencies.ts'
import { objectFromFormData } from '../../lib/form-data-payload.ts'
import { fetchPortfolioSnapshot } from '../../lib/gist.ts'
import { fetchGuidelines } from '../../lib/guidelines.ts'
import { t } from '../../lib/i18n.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import {
	getLayoutSession,
	getSessionData,
	type SessionData,
	type SessionWithGithubGist,
	sessionUsesGithubGist,
} from '../../lib/session.ts'
import { htmlLangForCurrentUiLocale } from '../../lib/ui-locale.ts'
import { routes } from '../../routes.ts'
import { parseOptionalAdviceModelFromUrl } from '../catalog/catalog-etf-overlay-build.ts'
import { type CatalogEntry, fetchCatalog } from '../catalog/lib.ts'
import { getOrCreateAdviceClient } from './advice-client.ts'
import type { AdviceDocument } from './advice-document.ts'
import { overlayCatalogEntryIdFromRequestUrl } from './advice-etf-url.ts'
import {
	clearLegacyUnifiedAdviceAnalysis,
	clearStoredAdviceAnalysisForTab,
	fetchStoredAdviceAnalysisForTab,
	saveStoredAdviceAnalysisForTab,
} from './advice-gist.ts'
import type { AdviceAnalysisMode, AdviceModelId } from './advice-openai.ts'
import {
	ADVICE_ANALYSIS_MODES,
	ADVICE_MODEL_IDS,
	DEFAULT_ADVICE_ANALYSIS_MODE,
	DEFAULT_ADVICE_MODEL,
	getInvestmentAdvice,
	normalizeAdviceAnalysisTab,
} from './advice-openai.ts'
import {
	AdvicePage,
	AdviceResultCard,
	type AdviceResultCardProps,
} from './advice-page.tsx'

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

type AdvicePageRenderProps = {
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
	/** Shown when `advice` was loaded from `advice-analysis.json` in the user gist. */
	adviceFromGist?: boolean
	adviceGistSavedAt?: string
	/** Gist persistence failed for this response; analysis is shown from the action only. */
	adviceGistPersistFailed?: boolean
	formError?: { summary: string; detail?: string }
	pendingApproval?: boolean
	adviceGistGate?: 'sign_in' | 'connect_gist'
}

const ADVICE_GIST_STALE_HEADER = 'X-Advice-Gist-Stale'

function adviceResultFragmentSrc(url: string): string {
	const incoming = new URL(url)
	const tabQuery =
		incoming.searchParams.get('tab') === 'portfolio_review'
			? 'portfolio_review'
			: 'buy_next'
	const base = routes.advice.fragmentResult.href()
	const out = new URL(base, 'https://advice-fragment.local')
	out.searchParams.set('tab', tabQuery)
	const catalogEntryIdForOverlay = overlayCatalogEntryIdFromRequestUrl(
		incoming.href,
	)
	if (catalogEntryIdForOverlay !== null) {
		out.searchParams.set('etf', catalogEntryIdForOverlay)
	}
	const model = parseOptionalAdviceModelFromUrl(incoming.href)
	if (model !== DEFAULT_ADVICE_MODEL) {
		out.searchParams.set('model', model)
	}
	return `${out.pathname}${out.search}`
}

function shouldStreamAdviceResult(
	props: AdvicePageRenderProps,
	requestUrl: string,
): boolean {
	if (props.adviceGistGate !== undefined) return false
	if (props.advice === undefined) return false
	const resultMode =
		props.lastAnalysisMode ?? props.analysisMode ?? DEFAULT_ADVICE_ANALYSIS_MODE
	if (resultMode === 'portfolio_review') return true
	// `buy_next` + empty cash: allow fragment when `?etf=` is open (result card is still shown).
	if (overlayCatalogEntryIdFromRequestUrl(requestUrl) !== null) {
		return true
	}
	return props.cashAmount !== undefined
}

function adviceResultCardPropsFromPage(
	props: AdvicePageRenderProps,
	requestUrl: string,
): AdviceResultCardProps | null {
	if (
		!shouldStreamAdviceResult(props, requestUrl) ||
		props.advice === undefined
	) {
		return null
	}
	return {
		advice: props.advice,
		lastAnalysisMode: props.lastAnalysisMode,
		analysisMode: props.analysisMode,
		cashAmount: props.cashAmount,
		cashCurrency: props.cashCurrency,
		selectedModel: props.selectedModel,
		catalog: props.catalog,
		activeTab: props.activeTab,
		adviceFromGist: props.adviceFromGist,
		adviceGistSavedAt: props.adviceGistSavedAt,
		adviceGistPersistFailed: props.adviceGistPersistFailed,
		pendingApproval: props.pendingApproval === true,
		adviceGistGate: props.adviceGistGate,
	}
}

function resolveAdviceResultFrame(
	source: string,
	frameSrc: string | undefined,
	props: AdvicePageRenderProps,
	requestUrl: string,
) {
	if (frameSrc === undefined || source !== frameSrc) return ''
	const cardProps = adviceResultCardPropsFromPage(props, requestUrl)
	if (cardProps === null) return ''
	return renderToStream(jsx(AdviceResultCard, cardProps))
}

async function renderAdvicePageResponse(options: {
	session: SessionData | null
	props: AdvicePageRenderProps
	requestUrl: string
	init?: ResponseInit
}) {
	const propsWithCatalog =
		overlayCatalogEntryIdFromRequestUrl(options.requestUrl) !== null &&
		options.props.catalog === undefined
			? {
					...options.props,
					catalog: await fetchCatalog(),
				}
			: options.props

	const activeTab = normalizeAdviceAnalysisTab(propsWithCatalog.activeTab)
	const frameSrc = shouldStreamAdviceResult(
		propsWithCatalog,
		options.requestUrl,
	)
		? adviceResultFragmentSrc(options.requestUrl)
		: undefined

	const responseHeaders =
		propsWithCatalog.adviceGistPersistFailed === true
			? { [ADVICE_GIST_STALE_HEADER]: '1' }
			: undefined

	return await render({
		requestUrl: options.requestUrl,
		title: t('meta.title.advice'),
		htmlLang: htmlLangForCurrentUiLocale(),
		session: options.session,
		currentPage: 'advice',
		body: jsx(AdvicePage, {
			...propsWithCatalog,
			adviceResultFrameSrc: frameSrc,
			activeTab,
			requestUrl: options.requestUrl,
		}),
		init: options.init,
		responseHeaders,
		resolveFrame(source) {
			return resolveAdviceResultFrame(
				source,
				frameSrc,
				propsWithCatalog,
				options.requestUrl,
			)
		},
	})
}

/**
 * True when we cannot load `advice-analysis.json` from the user's gist for this request
 * (layout pending approval, missing session, account pending, or no linked gist).
 */
function cannotLoadAdviceGistSnapshot(options: {
	pendingApproval: boolean
	session: SessionData | null
}): boolean {
	const { pendingApproval, session } = options
	return (
		pendingApproval ||
		session == null ||
		session.approvalStatus === 'pending' ||
		!sessionUsesGithubGist(session)
	)
}

async function loadAdvicePageState(options: {
	session: SessionData | null
	pendingApproval: boolean
	activeTab: AdviceAnalysisMode
}): Promise<Omit<AdvicePageRenderProps, 'adviceGistGate'>> {
	const { pendingApproval, activeTab, session } = options
	const baseProps = {
		pendingApproval,
		analysisMode: DEFAULT_ADVICE_ANALYSIS_MODE,
		activeTab,
	}

	if (cannotLoadAdviceGistSnapshot({ pendingApproval, session })) {
		return baseProps
	}
	// Type guard: `cannotLoadAdviceGistSnapshot` already implies this; TS needs the call to narrow `session`.
	if (!sessionUsesGithubGist(session)) {
		return baseProps
	}
	const gistSession: SessionWithGithubGist = session

	try {
		const stored = await fetchStoredAdviceAnalysisForTab(
			gistSession.token,
			gistSession.gistId,
			activeTab,
		)
		if (stored !== null) {
			const catalog = await fetchCatalog()
			const adviceGistSavedAt = new Date(stored.savedAt).toISOString()
			return {
				...baseProps,
				analysisMode: stored.lastAnalysisMode,
				lastAnalysisMode: stored.lastAnalysisMode,
				selectedModel: stored.selectedModel,
				...(stored.lastAnalysisMode === 'portfolio_review'
					? {}
					: {
							cashAmount: stored.cashAmount ?? '',
							cashCurrency: stored.cashCurrency,
						}),
				advice: stored.document,
				catalog,
				adviceFromGist: true,
				adviceGistSavedAt,
			}
		}
	} catch (err) {
		console.warn('[advice] could not load gist snapshot', err)
	}

	return baseProps
}

function adviceGistGateProps(
	layoutSession: SessionData | null,
	fullSession: SessionData | null,
	pendingApproval: boolean,
): { adviceGistGate?: 'sign_in' | 'connect_gist' } {
	if (pendingApproval) return {}
	if (sessionUsesGithubGist(fullSession)) return {}
	if (layoutSession === null) return { adviceGistGate: 'sign_in' }
	return { adviceGistGate: 'connect_gist' }
}

function withAdviceGate(
	props: Omit<AdvicePageRenderProps, 'adviceGistGate'>,
	layoutSession: SessionData | null,
	fullSession: SessionData | null,
	pendingApproval: boolean,
): AdvicePageRenderProps {
	return {
		...props,
		...adviceGistGateProps(layoutSession, fullSession, pendingApproval),
	}
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
			const session = getSessionData(context.get(Session))
			const baseProps = await loadAdvicePageState({
				session,
				pendingApproval,
				activeTab,
			})
			return await renderAdvicePageResponse({
				session: layoutSession,
				requestUrl: context.request.url,
				props: withAdviceGate(
					baseProps,
					layoutSession,
					session,
					pendingApproval,
				),
			})
		},

		async fragmentResult(context: AppRequestContext) {
			const layoutSession = getLayoutSession(context.get(Session))
			const pendingApproval = layoutSession?.approvalStatus === 'pending'
			const activeTab = parseAdviceTabParam(context.request.url)
			const session = getSessionData(context.get(Session))
			const baseProps = await loadAdvicePageState({
				session,
				pendingApproval,
				activeTab,
			})
			const props = withAdviceGate(
				baseProps,
				layoutSession,
				session,
				pendingApproval,
			)
			const cardProps = adviceResultCardPropsFromPage(
				props,
				context.request.url,
			)
			if (cardProps === null) {
				return new Response(null, {
					status: 204,
					headers: { 'Cache-Control': 'no-store' },
				})
			}
			return createHtmlResponse(
				renderToStream(jsx(AdviceResultCard, cardProps)),
				{ headers: { 'Cache-Control': 'no-store' } },
			)
		},

		async action(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			const layoutSession = getLayoutSession(context.get(Session))
			const pendingApproval = layoutSession?.approvalStatus === 'pending'
			const activeTabFromUrl = parseAdviceTabParam(context.request.url)
			const form = context.get(FormData)
			if (!form) {
				return await renderAdvicePageResponse({
					session: layoutSession,
					requestUrl: context.request.url,
					props: withAdviceGate(
						{
							pendingApproval,
							analysisMode: DEFAULT_ADVICE_ANALYSIS_MODE,
							activeTab: activeTabFromUrl,
							formError: {
								summary: t('errors.advice.formRead'),
								detail: t('errors.advice.formReadDetail'),
							},
						},
						layoutSession,
						session,
						pendingApproval,
					),
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
				return await renderAdvicePageResponse({
					session: layoutSession,
					requestUrl: context.request.url,
					props: withAdviceGate(
						{
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
						layoutSession,
						session,
						pendingApproval,
					),
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
				return await renderAdvicePageResponse({
					session: layoutSession,
					requestUrl: context.request.url,
					props: withAdviceGate(
						{
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
						layoutSession,
						session,
						pendingApproval,
					),
					init: { status: 400 },
				})
			}
			const cashAmount = trimmedCash

			if (pendingApproval) {
				return await renderAdvicePageResponse({
					session: layoutSession,
					requestUrl: context.request.url,
					props: withAdviceGate(
						{
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
						layoutSession,
						session,
						true,
					),
					init: { status: 403 },
				})
			}

			if (analysisMode === 'portfolio_review' && adviceIntent === 'clear') {
				if (!sessionUsesGithubGist(session)) {
					return await renderAdvicePageResponse({
						session: layoutSession,
						requestUrl: context.request.url,
						props: withAdviceGate(
							{
								pendingApproval,
								analysisMode,
								activeTab: activeTabFromUrl,
								selectedModel: adviceModel,
								formError: {
									summary: t('errors.advice.requiresGithubGist'),
								},
							},
							layoutSession,
							session,
							pendingApproval,
						),
						init: { status: 403 },
					})
				}
				try {
					await clearStoredAdviceAnalysisForTab(
						session.token,
						session.gistId,
						'portfolio_review',
					)
				} catch (err) {
					console.warn(
						'[advice] could not clear portfolio review snapshot',
						err,
					)
				}
				try {
					await clearLegacyUnifiedAdviceAnalysis(session.token, session.gistId)
				} catch (err) {
					console.warn('[advice] could not clear legacy advice snapshot', err)
				}
				const catalog =
					activeTabFromUrl === 'portfolio_review'
						? await fetchCatalog()
						: undefined
				return await renderAdvicePageResponse({
					session: layoutSession,
					requestUrl: context.request.url,
					props: withAdviceGate(
						{
							pendingApproval,
							analysisMode: DEFAULT_ADVICE_ANALYSIS_MODE,
							activeTab: activeTabFromUrl,
							selectedModel: adviceModel,
							...(catalog !== undefined ? { catalog } : {}),
						},
						layoutSession,
						session,
						pendingApproval,
					),
				})
			}

			if (!sessionUsesGithubGist(session)) {
				return await renderAdvicePageResponse({
					session: layoutSession,
					requestUrl: context.request.url,
					props: withAdviceGate(
						{
							pendingApproval,
							...(analysisMode === 'portfolio_review'
								? {}
								: { cashAmount, cashCurrency }),
							analysisMode,
							activeTab: activeTabFromUrl,
							selectedModel: adviceModel,
							formError: {
								summary: t('errors.advice.requiresGithubGist'),
							},
						},
						layoutSession,
						session,
						pendingApproval,
					),
					init: { status: 403 },
				})
			}

			try {
				const { catalog, entries } = await fetchPortfolioSnapshot(
					session.token,
					session.gistId,
				)
				const guidelines = await fetchGuidelines(session.token, session.gistId)

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
				let adviceGistPersistFailed = false
				try {
					await saveStoredAdviceAnalysisForTab(
						session.token,
						session.gistId,
						analysisMode,
						{
							version: 1,
							savedAt: Date.now(),
							lastAnalysisMode: analysisMode,
							cashCurrency,
							...(analysisMode === 'buy_next' ? { cashAmount } : {}),
							selectedModel: adviceModel,
							activeTab: activeTabFromUrl,
							document: advice,
						},
					)
				} catch (gistErr) {
					// Frame reload reads from gist; without this flag + client handling the result would disappear.
					adviceGistPersistFailed = true
					console.warn('[advice] could not save gist snapshot', gistErr)
				}
				return await renderAdvicePageResponse({
					session: layoutSession,
					requestUrl: context.request.url,
					props: withAdviceGate(
						{
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
							...(adviceGistPersistFailed
								? { adviceGistPersistFailed: true }
								: {}),
						},
						layoutSession,
						session,
						pendingApproval,
					),
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
				return await renderAdvicePageResponse({
					session: layoutSession,
					requestUrl: context.request.url,
					props: withAdviceGate(
						{
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
						layoutSession,
						session,
						pendingApproval,
					),
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
