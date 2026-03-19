import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { object, optional, parseSafe, string } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import type { EtfEntry } from '../../../lib/gist.ts'
import { fetchEtfs, saveEtfs } from '../../../lib/gist.ts'
import { getSessionData } from '../../../lib/session.ts'
import { routes } from '../../../routes.ts'
import { getGuestEntries, guestEntries } from '../state.ts'
import { AddEtfForm } from './add-etf-form.tsx'
import { ListFragment } from './list-fragment.tsx'

const CreateEtfSchema = object({
	etfName: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
	exchange: optional(string()),
	quantity: optional(coerce.number().pipe(min(0))),
})

export { AddEtfForm, ListFragment }

export const addEtfFormHandlers = {
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
			const message = 'Please enter a valid ETF name and value (number >= 0).'
			context.session.flash('error', message)
			return createRedirectResponse(routes.portfolio.index.href(), {
				headers: { 'X-Flash-Error': message },
			})
		}

		const { etfName: name, value, currency, exchange, quantity } = result.value
		const session = getSessionData(context.session)
		const current = session?.gistId
			? await fetchEtfs(session.token, session.gistId)
			: getGuestEntries()

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
			guestEntries.length = 0
			guestEntries.push(...updated)
		}

		return createRedirectResponse(routes.portfolio.index.href())
	},

	async fragmentList(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const entries = session?.gistId
			? await fetchEtfs(session.token, session.gistId)
			: getGuestEntries()
		const html = await renderToString(jsx(ListFragment, { entries }))
		return createHtmlResponse(html, {
			headers: { 'Cache-Control': 'no-store' },
		})
	},
}
