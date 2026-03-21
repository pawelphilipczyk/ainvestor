import { jsx } from 'remix/component/jsx-runtime'
import { parseSafe, string } from 'remix/data-schema'
import { minLength } from 'remix/data-schema/checks'
import * as f from 'remix/data-schema/form-data'
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

const cashAmountSchema = string().pipe(minLength(1))

const AdviceFormSchema = f.object({
	cashAmount: f.field(cashAmountSchema),
})

function renderAdviceResponse(
	session: SessionData | null,
	props: { cashAmount?: string; advice?: string; error?: string },
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
					error: 'Could not read your form. Please try again.',
				},
				{ status: 400 },
			)
		}

		const result = parseSafe(AdviceFormSchema, form)
		if (!result.success) {
			const raw = form.get('cashAmount')
			const cashAmount =
				typeof raw === 'string' && raw.length > 0 ? raw : undefined
			return renderAdviceResponse(
				session,
				{
					cashAmount,
					error: 'Enter a valid cash amount (USD).',
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

		const client = adviceClient ?? createDefaultClient()
		try {
			const advice = await getInvestmentAdvice(
				entries,
				guidelines,
				cashAmount,
				client,
			)
			return renderAdviceResponse(session, { cashAmount, advice })
		} catch (err) {
			console.error('[advice] getInvestmentAdvice failed', err)
			return renderAdviceResponse(
				session,
				{
					cashAmount,
					error:
						"We couldn't get advice right now. Please try again in a moment.",
				},
				{ status: 503 },
			)
		}
	},
}
