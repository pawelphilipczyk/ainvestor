import { jsx } from 'remix/component/jsx-runtime'
import type { Issue } from 'remix/data-schema'
import { defaulted, enum_, object, parseSafe, string } from 'remix/data-schema'
import { minLength } from 'remix/data-schema/checks'
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
import type { AdviceClient, AdviceModelId } from '../../openai.ts'
import {
	ADVICE_MODEL_IDS,
	createDefaultClient,
	DEFAULT_ADVICE_MODEL,
	getInvestmentAdvice,
} from '../../openai.ts'
import type { AdviceDocument } from './advice-document.ts'
import { AdvicePage } from './advice-page.tsx'

const AdviceSchema = object({
	cashAmount: string().pipe(minLength(1)),
	cashCurrency: defaulted(enum_(CURRENCIES), 'PLN'),
	adviceModel: defaulted(enum_(ADVICE_MODEL_IDS), DEFAULT_ADVICE_MODEL),
})

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
		return renderAdviceResponse({
			session: layoutSession,
			props: { pendingApproval },
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
		const form = context.formData
		if (!form) {
			return renderAdviceResponse({
				session: layoutSession,
				props: {
					pendingApproval,
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
			return renderAdviceResponse({
				session: layoutSession,
				props: {
					pendingApproval,
					cashAmount,
					cashCurrency,
					selectedModel,
					formError: {
						summary: t('errors.advice.validation'),
						detail: formatSchemaIssues(result.issues),
					},
				},
				init: { status: 400 },
			})
		}
		const { cashAmount, cashCurrency, adviceModel } = result.value

		if (pendingApproval) {
			return renderAdviceResponse({
				session: layoutSession,
				props: {
					pendingApproval: true,
					cashAmount,
					cashCurrency,
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
			})
			return renderAdviceResponse({
				session: layoutSession,
				props: {
					pendingApproval,
					cashAmount,
					cashCurrency,
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
