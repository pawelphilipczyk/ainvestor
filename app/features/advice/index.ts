import { jsx } from 'remix/component/jsx-runtime'
import { object, parseSafe, string } from 'remix/data-schema'
import { minLength } from 'remix/data-schema/checks'
import type { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { fetchEtfs } from '../../lib/gist.ts'
import { fetchGuidelines } from '../../lib/guidelines.ts'
import { getSessionData } from '../../lib/session.ts'
import type { AdviceClient } from '../../openai.ts'
import { createDefaultClient, getInvestmentAdvice } from '../../openai.ts'
import { getGuestGuidelines } from '../guidelines/index.ts'
import { getGuestEntries } from '../portfolio/index.ts'
import { AdvicePage } from './advice-page.tsx'

const AdviceSchema = object({
	cashAmount: string().pipe(minLength(1)),
})

// ---------------------------------------------------------------------------
// Advice client (injectable for tests)
// ---------------------------------------------------------------------------
let adviceClient: AdviceClient | null = null

export function setAdviceClient(client: AdviceClient | null) {
	adviceClient = client
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function adviceHandler(context: {
	request: Request
	session: Session
	formData: FormData | null
}) {
	const form = context.formData
	if (!form) {
		return new Response('Bad request', { status: 400 })
	}

	const result = parseSafe(
		AdviceSchema,
		Object.fromEntries(
			form as unknown as Iterable<[string, FormDataEntryValue]>,
		),
	)
	if (!result.success) {
		return new Response('cashAmount is required', { status: 400 })
	}
	const { cashAmount } = result.value

	const session = getSessionData(context.session)
	const entries = session?.gistId
		? await fetchEtfs(session.token, session.gistId)
		: getGuestEntries()
	const guidelines = session?.gistId
		? await fetchGuidelines(session.token, session.gistId)
		: getGuestGuidelines()

	const client = adviceClient ?? createDefaultClient()
	const advice = await getInvestmentAdvice(
		entries,
		guidelines,
		cashAmount,
		client,
	)

	const body = jsx(AdvicePage, { cashAmount, advice })
	return render({
		title: 'AI Investor – Advice',
		session,
		currentPage: 'portfolio',
		body,
	})
}
