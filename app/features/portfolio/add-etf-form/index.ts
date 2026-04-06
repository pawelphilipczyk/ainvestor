import { jsx } from 'remix/component/jsx-runtime'
import { renderToStream } from 'remix/component/server'
import { object, optional, parseSafe, string } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { objectFromFormData } from '../../../lib/form-data-payload.ts'
import type { EtfEntry } from '../../../lib/gist.ts'
import {
	fetchEtfs,
	fetchPortfolioSnapshot,
	saveEtfs,
} from '../../../lib/gist.ts'
import { getGuestEtfs, setGuestEtfs } from '../../../lib/guest-session-state.ts'
import { t } from '../../../lib/i18n.ts'
import { parseLocaleDecimalString } from '../../../lib/locale-decimal-input.ts'
import type { AppRequestContext } from '../../../lib/request-context.ts'
import { getSessionData } from '../../../lib/session.ts'
import { routes } from '../../../routes.ts'
import {
	type CatalogEntry,
	fetchCatalog,
	findCatalogEntryByTicker,
} from '../../catalog/lib.ts'
import { AddEtfForm } from './add-etf-form.tsx'
import { ListFragment } from './list-fragment.tsx'

const optionalWholeNumberQuantity = optional(
	coerce
		.number()
		.pipe(min(0))
		.refine((n) => Number.isInteger(n)),
)

export const CreateEtfSchema = object({
	instrumentTicker: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
	quantity: optionalWholeNumberQuantity,
})

export const UpdatePortfolioEntrySchema = object({
	value: coerce.number().pipe(min(0)),
	quantity: optionalWholeNumberQuantity,
})

/**
 * Parses locale-style `value` and cleans optional `quantity` on a form payload
 * (HTML submits "" for empty optional fields).
 */
function normalizeEtfNumericFields(raw: Record<string, unknown>): void {
	if (typeof raw.value === 'string') {
		const parsed = parseLocaleDecimalString(raw.value)
		raw.value = parsed === null ? raw.value : String(parsed)
	}
	if (typeof raw.quantity === 'string') {
		const trimmed = raw.quantity.trim()
		if (trimmed === '') {
			delete raw.quantity
		} else {
			const parsed = parseLocaleDecimalString(trimmed)
			raw.quantity = parsed === null ? raw.quantity : String(parsed)
		}
	}
}

/** Treats empty strings as absent for optional fields (HTML forms submit "" when blank). */
export function normalizeAddEtfInput(raw: Record<string, unknown>): void {
	normalizeEtfNumericFields(raw)
}

/** Normalizes value/quantity for updating an existing holding (same rules as add form). */
export function normalizePortfolioUpdateInput(
	raw: Record<string, unknown>,
): void {
	normalizeEtfNumericFields(raw)
}

function prefersJson(request: Request): boolean {
	return request.headers.get('Accept')?.includes('application/json') ?? false
}

/** Matches `FrameSubmitEnhancement` fetch (`Accept: text/html` only), not browser document navigations. */
function prefersHtmlFrame(request: Request): boolean {
	const accept = request.headers.get('Accept') ?? ''
	return accept.trim() === 'text/html'
}

function portfolioListFragmentHtmlResponse(params: {
	entries: EtfEntry[]
	inlineError?: string
	status?: number
}) {
	return createHtmlResponse(
		renderToStream(
			jsx(ListFragment, {
				entries: params.entries,
				...(params.inlineError !== undefined && params.inlineError.length > 0
					? { inlineError: params.inlineError }
					: {}),
			}),
		),
		{
			status: params.status ?? 200,
			headers: { 'Cache-Control': 'no-store' },
		},
	)
}

/**
 * Loads current holdings for the session. Returns `null` when the gist snapshot
 * cannot be read (same class of failure as save errors).
 */
async function loadPortfolioEntries(
	context: AppRequestContext,
): Promise<EtfEntry[] | null> {
	const session = getSessionData(context.get(Session))
	if (session?.gistId && session.token) {
		try {
			const snapshot = await fetchPortfolioSnapshot(
				session.token,
				session.gistId,
			)
			return snapshot.entries
		} catch {
			return null
		}
	}
	return getGuestEtfs(context.get(Session))
}

async function portfolioPersistenceFailureResponse(
	context: AppRequestContext,
): Promise<Response> {
	const message = t('errors.portfolio.persistence')
	if (prefersJson(context.request)) {
		return new Response(JSON.stringify({ error: message }), {
			status: 422,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	if (prefersHtmlFrame(context.request)) {
		const entries = await loadPortfolioEntries(context)
		return portfolioListFragmentHtmlResponse({
			entries: entries ?? [],
			inlineError: message,
			status: 422,
		})
	}
	context.get(Session).flash('error', message)
	return createRedirectResponse(routes.portfolio.index.href())
}

export { AddEtfForm, ListFragment }

export const addEtfFormHandlers = {
	actions: {
		async create(context: AppRequestContext) {
			const form = context.get(FormData)
			if (!form) return createRedirectResponse(routes.portfolio.index.href())

			const formPayload = objectFromFormData(form)
			normalizeAddEtfInput(formPayload)

			const result = parseSafe(CreateEtfSchema, formPayload)
			if (!result.success) {
				const message = t('errors.portfolio.addInvalid')
				if (prefersJson(context.request)) {
					return new Response(JSON.stringify({ error: message }), {
						status: 422,
						headers: { 'Content-Type': 'application/json' },
					})
				}
				if (prefersHtmlFrame(context.request)) {
					const entries = await loadPortfolioEntries(context)
					if (entries === null) {
						return portfolioListFragmentHtmlResponse({
							entries: [],
							inlineError: t('errors.portfolio.persistence'),
							status: 422,
						})
					}
					return portfolioListFragmentHtmlResponse({
						entries,
						inlineError: message,
						status: 422,
					})
				}
				context.get(Session).flash('error', message)
				return createRedirectResponse(routes.portfolio.index.href())
			}

			const { instrumentTicker, value, currency, quantity } = result.value
			const session = getSessionData(context.get(Session))
			let catalog: CatalogEntry[]
			let current: EtfEntry[]
			if (session?.gistId && session.token) {
				try {
					const snapshot = await fetchPortfolioSnapshot(
						session.token,
						session.gistId,
					)
					catalog = snapshot.catalog
					current = snapshot.entries
				} catch {
					return portfolioPersistenceFailureResponse(context)
				}
			} else {
				catalog = await fetchCatalog()
				current = getGuestEtfs(context.get(Session))
			}
			const match = findCatalogEntryByTicker(catalog, instrumentTicker)
			if (!match) {
				const message = t('errors.portfolio.catalogEntryMissing')
				if (prefersJson(context.request)) {
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
				if (prefersHtmlFrame(context.request)) {
					return portfolioListFragmentHtmlResponse({
						entries: current,
						inlineError: message,
						status: 422,
					})
				}
				context.get(Session).flash('error', message)
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
				try {
					await saveEtfs(session.token, session.gistId, updated)
				} catch {
					return portfolioPersistenceFailureResponse(context)
				}
			} else {
				setGuestEtfs(context.get(Session), updated)
			}

			if (prefersHtmlFrame(context.request)) {
				return portfolioListFragmentHtmlResponse({ entries: updated })
			}
			return createRedirectResponse(routes.portfolio.index.href())
		},

		async update(context: AppRequestContext) {
			if (
				context.params == null ||
				typeof context.params !== 'object' ||
				Array.isArray(context.params)
			) {
				return createRedirectResponse(routes.portfolio.index.href())
			}
			const id = (context.params as Record<string, string>).id
			if (!id) return createRedirectResponse(routes.portfolio.index.href())

			const form = context.get(FormData)
			if (!form) return createRedirectResponse(routes.portfolio.index.href())

			const formPayload = objectFromFormData(form)
			normalizePortfolioUpdateInput(formPayload)
			const result = parseSafe(UpdatePortfolioEntrySchema, formPayload)
			if (!result.success) {
				const message = t('errors.portfolio.updateInvalid')
				if (prefersJson(context.request)) {
					return new Response(JSON.stringify({ error: message }), {
						status: 422,
						headers: { 'Content-Type': 'application/json' },
					})
				}
				if (prefersHtmlFrame(context.request)) {
					const entries = await loadPortfolioEntries(context)
					if (entries === null) {
						return portfolioListFragmentHtmlResponse({
							entries: [],
							inlineError: t('errors.portfolio.persistence'),
							status: 422,
						})
					}
					return portfolioListFragmentHtmlResponse({
						entries,
						inlineError: message,
						status: 422,
					})
				}
				context.get(Session).flash('error', message)
				return createRedirectResponse(routes.portfolio.index.href())
			}

			const { value, quantity } = result.value

			const session = getSessionData(context.get(Session))
			let current: EtfEntry[]
			if (session?.gistId && session.token) {
				try {
					current = await fetchEtfs(session.token, session.gistId)
				} catch {
					return portfolioPersistenceFailureResponse(context)
				}
			} else {
				current = getGuestEtfs(context.get(Session))
			}

			const index = current.findIndex((entry) => entry.id === id)
			if (index < 0) {
				const message = t('errors.portfolio.entryNotFound')
				if (prefersJson(context.request)) {
					return new Response(JSON.stringify({ error: message }), {
						status: 422,
						headers: { 'Content-Type': 'application/json' },
					})
				}
				if (prefersHtmlFrame(context.request)) {
					return portfolioListFragmentHtmlResponse({
						entries: current,
						inlineError: message,
						status: 422,
					})
				}
				context.get(Session).flash('error', message)
				return createRedirectResponse(routes.portfolio.index.href())
			}

			const existing = current[index]
			const updatedEntry: EtfEntry = { ...existing, value }
			if (quantity !== undefined) {
				updatedEntry.quantity = quantity
			} else {
				delete updatedEntry.quantity
			}
			const updated = current.map((entry, entryIndex) =>
				entryIndex === index ? updatedEntry : entry,
			)

			if (session?.gistId && session.token) {
				try {
					await saveEtfs(session.token, session.gistId, updated)
				} catch {
					return portfolioPersistenceFailureResponse(context)
				}
			} else {
				setGuestEtfs(context.get(Session), updated)
			}

			if (prefersHtmlFrame(context.request)) {
				return portfolioListFragmentHtmlResponse({ entries: updated })
			}
			return createRedirectResponse(routes.portfolio.index.href())
		},
	},
}
