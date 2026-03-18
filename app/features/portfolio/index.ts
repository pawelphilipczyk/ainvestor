import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { object, optional, parseSafe, string } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { html } from 'remix/html-template'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import { pageShell } from '../../components/page-shell.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs, saveEtfs } from '../../lib/gist.ts'
import { decodeCsvBytes, parsePortfolioCsv } from '../../lib/portfolio-csv.ts'
import type { SessionData } from '../../lib/session.ts'
import { getSessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { PortfolioPage } from './portfolio-page.tsx'

const CreateEtfSchema = object({
	etfName: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
	exchange: optional(string()),
	quantity: optional(coerce.number().pipe(min(0))),
})

// ---------------------------------------------------------------------------
// Guest state
// ---------------------------------------------------------------------------
let guestEntries: EtfEntry[] = []

export function resetEtfEntries() {
	guestEntries = []
}

export function getGuestEntries(): EtfEntry[] {
	return guestEntries
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const portfolioController = {
	async index(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const entries = session?.gistId
			? await fetchEtfs(session.token, session.gistId)
			: guestEntries
		return renderPage(entries, session)
	},

	async create(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.portfolio.index.href())

		const raw = Object.fromEntries(
			form as unknown as Iterable<[string, FormDataEntryValue]>,
		)
		if (typeof raw.value === 'string') {
			raw.value = raw.value.replace(/,/g, '')
		}
		if (typeof raw.quantity === 'string') {
			raw.quantity = raw.quantity.replace(/,/g, '')
		}

		const result = parseSafe(CreateEtfSchema, raw)
		if (!result.success) {
			return createRedirectResponse(routes.portfolio.index.href())
		}

		const { etfName: name, value, currency, exchange, quantity } = result.value
		const session = getSessionData(context.session)
		const current = session?.gistId
			? await fetchEtfs(session.token, session.gistId)
			: guestEntries

		const normalizedName = name.toLowerCase()
		const normalizedCurrency = currency.toUpperCase()
		const existingIndex = current.findIndex(
			(e) =>
				e.name.toLowerCase() === normalizedName &&
				e.currency.toUpperCase() === normalizedCurrency,
		)
		const existing = existingIndex >= 0 ? current[existingIndex] : null
		const entry: EtfEntry = existing
			? {
					...existing,
					value: existing.value + value,
					quantity:
						existing.quantity !== undefined && quantity !== undefined
							? existing.quantity + quantity
							: (quantity ?? existing.quantity),
					exchange: existing.exchange || exchange || undefined,
				}
			: {
					id: crypto.randomUUID(),
					name,
					value,
					currency: normalizedCurrency,
					...(exchange ? { exchange } : {}),
					...(quantity !== undefined ? { quantity } : {}),
				}

		const updated =
			existingIndex >= 0
				? current.map((e, i) => (i === existingIndex ? entry : e))
				: [entry, ...current]

		if (session?.gistId) {
			await saveEtfs(session.token, session.gistId, updated)
		} else {
			guestEntries = updated
		}

		return createRedirectResponse(routes.portfolio.index.href())
	},

	async import(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.portfolio.index.href())

		const file = form.get('portfolioCsv')
		if (!file || typeof file === 'string')
			return createRedirectResponse(routes.portfolio.index.href())

		const bytes = await (file as Blob).arrayBuffer()
		const csvText = decodeCsvBytes(bytes)
		const imported = parsePortfolioCsv(csvText)
		if (imported.length === 0)
			return createRedirectResponse(routes.portfolio.index.href())

		const session = getSessionData(context.session)
		const current = session?.gistId
			? await fetchEtfs(session.token, session.gistId)
			: guestEntries

		// Merge imported with existing (same name+currency: add values, quantity)
		const byKey = new Map<string, EtfEntry>()
		for (const e of current) {
			byKey.set(`${e.name.toLowerCase()}:${e.currency}`, e)
		}
		for (const e of imported) {
			const key = `${e.name.toLowerCase()}:${e.currency}`
			const existing = byKey.get(key)
			if (existing) {
				const quantity =
					existing.quantity !== undefined && e.quantity !== undefined
						? existing.quantity + e.quantity
						: (e.quantity ?? existing.quantity)
				byKey.set(key, {
					...existing,
					value: existing.value + e.value,
					quantity,
					exchange: existing.exchange || e.exchange || undefined,
				})
			} else {
				byKey.set(key, e)
			}
		}
		const updated = Array.from(byKey.values())

		if (session?.gistId) {
			await saveEtfs(session.token, session.gistId, updated)
		} else {
			guestEntries = updated
		}

		return createRedirectResponse(routes.portfolio.index.href())
	},

	async delete(context: {
		request: Request
		session: Session
		params: unknown
	}) {
		const id = (context.params as Record<string, string>).id
		if (!id) return createRedirectResponse(routes.portfolio.index.href())

		const session = getSessionData(context.session)

		if (session?.gistId) {
			const current = await fetchEtfs(session.token, session.gistId)
			await saveEtfs(
				session.token,
				session.gistId,
				current.filter((e) => e.id !== id),
			)
		} else {
			guestEntries = guestEntries.filter((e) => e.id !== id)
		}

		return createRedirectResponse(routes.portfolio.index.href())
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
async function renderPage(entries: EtfEntry[], session: SessionData | null) {
	const bodyMarkup = await renderToString(
		jsx(PortfolioPage, { entries, session }),
	)
	const body = html.raw`${bodyMarkup}`
	return createHtmlResponse(
		await pageShell('AI Investor', session, 'portfolio', body),
		{
			headers: { 'Cache-Control': 'no-store' },
		},
	)
}
