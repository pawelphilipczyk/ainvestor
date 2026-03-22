import { jsx } from 'remix/component/jsx-runtime'
import type { Issue } from 'remix/data-schema'
import { object, parseSafe, string } from 'remix/data-schema'
import { minLength } from 'remix/data-schema/checks'
import type { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { fetchEtfs } from '../../lib/gist.ts'
import { fetchGuidelines } from '../../lib/guidelines.ts'
import { getSessionData, type SessionData } from '../../lib/session.ts'
import type { AdviceClient } from '../../openai.ts'
import { createDefaultClient, getInvestmentAdvice } from '../../openai.ts'
import { getGuestGuidelines } from '../guidelines/index.ts'
import { getGuestEntries } from '../portfolio/index.ts'
import { AdvicePage } from './advice-page.tsx'

const AdviceSchema = object({
	cashAmount: string().pipe(minLength(1)),
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

function renderAdviceResponse(
	session: SessionData | null,
	props: {
		cashAmount?: string
		advice?: string
		formError?: { summary: string; detail?: string }
	},
	init?: ResponseInit,
) {
	return render({
		title: 'AI Investor – Get Advice',
		session,
		currentPage: 'advice',
		body: jsx(AdvicePage, props),
		init,
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
		const session = getSessionData(context.session)
		return renderAdviceResponse(session, {})
	},

	async action(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const session = getSessionData(context.session)
		const form = context.formData
		if (!form) {
			return renderAdviceResponse(
				session,
				{
					formError: {
						summary: 'Could not read your form. Please try again.',
						detail:
							'The server did not receive parseable form data for this request.',
					},
				},
				{ status: 400 },
			)
		}

		const result = parseSafe(
			AdviceSchema,
			Object.fromEntries(
				form as unknown as Iterable<[string, FormDataEntryValue]>,
			),
		)
		if (!result.success) {
			const raw = form.get('cashAmount')
			const cashAmount =
				typeof raw === 'string' && raw.length > 0 ? raw : undefined
			return renderAdviceResponse(
				session,
				{
					cashAmount,
					formError: {
						summary: 'Enter a valid cash amount (USD).',
						detail: formatSchemaIssues(result.issues),
					},
				},
				{ status: 400 },
			)
		}
		const { cashAmount } = result.value

		const entries = session?.gistId
			? await fetchEtfs(session.token, session.gistId)
			: getGuestEntries()
		const guidelines = session?.gistId
			? await fetchGuidelines(session.token, session.gistId)
			: getGuestGuidelines()

		try {
			const client = adviceClient ?? createDefaultClient()
			const advice = await getInvestmentAdvice(
				entries,
				guidelines,
				cashAmount,
				client,
			)
			return renderAdviceResponse(session, { cashAmount, advice })
		} catch (err) {
			console.error('[advice] request failed', err)
			const exposeStack = process.env.NODE_ENV !== 'production'
			const detail =
				err instanceof Error
					? exposeStack
						? `${err.message}\n${err.stack ?? ''}`.trim()
						: err.message
					: String(err)
			return renderAdviceResponse(
				session,
				{
					cashAmount,
					formError: {
						summary:
							"We couldn't get advice right now. Please try again in a moment.",
						detail,
					},
				},
				{ status: 503 },
			)
		}
	},
}
