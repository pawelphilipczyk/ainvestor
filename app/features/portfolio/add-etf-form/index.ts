import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { object, optional, parseSafe, string } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import type { EtfEntry } from '../../../lib/gist.ts'
import {
	fetchEtfs,
	fetchPortfolioSnapshot,
	saveEtfs,
} from '../../../lib/gist.ts'
import { getSessionData } from '../../../lib/session.ts'
import { routes } from '../../../routes.ts'
import { getGuestCatalog } from '../../catalog/guest-catalog.ts'
import {
	type CatalogEntry,
	findCatalogEntryByTicker,
} from '../../catalog/lib.ts'
import { getGuestEntries, guestEntries } from '../state.ts'
import { AddEtfForm } from './add-etf-form.tsx'
import { ListFragment } from './list-fragment.tsx'

export const CreateEtfSchema = object({
	instrumentTicker: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
	quantity: optional(coerce.number().pipe(min(0))),
})

/** Treats empty strings as absent for optional fields (HTML forms submit "" when blank). */
export function normalizeAddEtfInput(raw: Record<string, unknown>): void {
	if (typeof raw.value === 'string') {
		raw.value = raw.value.replace(/,/g, '')
	}
	if (typeof raw.quantity === 'string') {
		raw.quantity = raw.quantity.replace(/,/g, '')
	}
	if (raw.quantity === '') delete raw.quantity
}

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
		normalizeAddEtfInput(raw)

		const result = parseSafe(CreateEtfSchema, raw)
		if (!result.success) {
			const message =
				'Please select a fund from your catalog and enter a valid value (number >= 0).'
			const prefersJson = context.request.headers
				.get('Accept')
				?.includes('application/json')
			if (prefersJson) {
				return new Response(JSON.stringify({ error: message }), {
					status: 422,
					headers: { 'Content-Type': 'application/json' },
				})
			}
			context.session.flash('error', message)
			return createRedirectResponse(routes.portfolio.index.href())
		}

		const { instrumentTicker, value, currency, quantity } = result.value
		const session = getSessionData(context.session)
		let catalog: CatalogEntry[]
		let current: EtfEntry[]
		if (session?.gistId && session.token) {
			const snapshot = await fetchPortfolioSnapshot(
				session.token,
				session.gistId,
			)
			catalog = snapshot.catalog
			current = snapshot.entries
		} else {
			catalog = getGuestCatalog()
			current = getGuestEntries()
		}
		const match = findCatalogEntryByTicker(catalog, instrumentTicker)
		if (!match) {
			const message =
				'Selected catalog entry not found. Update your catalog or pick another fund.'
			const prefersJson = context.request.headers
				.get('Accept')
				?.includes('application/json')
			if (prefersJson) {
				return new Response(
					JSON.stringify({
						error: message,
						instrumentTicker: instrumentTicker.trim(),
						...(session?.gistId && session.token
							? { gistId: session.gistId }
							: {}),
					}),
					{
						status: 422,
						headers: { 'Content-Type': 'application/json' },
					},
				)
			}
			context.session.flash('error', message)
			return createRedirectResponse(routes.portfolio.index.href())
		}
		const name = match.name

		const normalizedName = name.toLowerCase()
		const normalizedCurrency = currency.toUpperCase()
		const normalizedTicker = match.ticker.toUpperCase()
		const existingIndex = current.findIndex((e) => {
			if (e.currency.toUpperCase() !== normalizedCurrency) return false
			if (e.ticker) {
				return e.ticker.toUpperCase() === normalizedTicker
			}
			return e.name.toLowerCase() === normalizedName
		})
		const existing = existingIndex >= 0 ? current[existingIndex] : null
		const ticker = match.ticker
		const entry: EtfEntry = existing
			? {
					...existing,
					ticker: existing.ticker ?? ticker,
					value: existing.value + value,
					quantity:
						existing.quantity !== undefined && quantity !== undefined
							? existing.quantity + quantity
							: (quantity ?? existing.quantity),
				}
			: {
					id: crypto.randomUUID(),
					name,
					ticker,
					value,
					currency: normalizedCurrency,
					...(quantity !== undefined ? { quantity } : {}),
				}

		const updated =
			existingIndex >= 0
				? current.map((e, i) => (i === existingIndex ? entry : e))
				: [entry, ...current]

		if (session?.gistId && session.token) {
			await saveEtfs(session.token, session.gistId, updated)
		} else {
			guestEntries.length = 0
			guestEntries.push(...updated)
		}

		return createRedirectResponse(routes.portfolio.index.href())
	},

	async fragmentList(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const entries =
			session?.gistId && session.token
				? await fetchEtfs(session.token, session.gistId)
				: getGuestEntries()
		const html = await renderToString(jsx(ListFragment, { entries }))
		return createHtmlResponse(html, {
			headers: { 'Cache-Control': 'no-store' },
		})
	},
}
