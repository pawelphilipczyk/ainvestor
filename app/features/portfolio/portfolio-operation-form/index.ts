import { literal, object, parseSafe, string, variant } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToStream } from 'remix/ui/server'
import { objectFromFormData } from '../../../lib/form-data-payload.ts'
import {
	requestAcceptsApplicationJson,
	requestAcceptsFrameSubmitHtml,
} from '../../../lib/frame-submit-request.ts'
import type { EtfEntry } from '../../../lib/gist.ts'
import { fetchPortfolioSnapshot, saveEtfs } from '../../../lib/gist.ts'
import { getGuestEtfs, setGuestEtfs } from '../../../lib/guest-session-state.ts'
import { t } from '../../../lib/i18n.ts'
import { parseLocaleDecimalString } from '../../../lib/locale-decimal-input.ts'
import type { AppRequestContext } from '../../../lib/request-context.ts'
import { getSessionData } from '../../../lib/session.ts'
import { flashBanner } from '../../../lib/session-flash.ts'
import { routes } from '../../../routes.ts'
import {
	type CatalogEntry,
	fetchCatalog,
	findCatalogEntryByTicker,
} from '../../catalog/lib.ts'
import { ListFragment } from './list-fragment.tsx'
import { PortfolioOperationForm } from './operation-form.tsx'

const portfolioOperationFields = {
	instrumentTicker: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
}

export const PortfolioBuyOperationSchema = object({
	portfolioOperation: literal('buy'),
	...portfolioOperationFields,
})

export const PortfolioSellOperationSchema = object({
	portfolioOperation: literal('sell'),
	...portfolioOperationFields,
	value: coerce
		.number()
		.pipe(min(0))
		.refine((n) => n > 0, t('errors.portfolio.sellValueNotPositive')),
})

export const PortfolioOperationSchema = variant('portfolioOperation', {
	buy: PortfolioBuyOperationSchema,
	sell: PortfolioSellOperationSchema,
})

function normalizePortfolioOperationValue(raw: Record<string, unknown>): void {
	if (typeof raw.value === 'string') {
		const parsed = parseLocaleDecimalString(raw.value)
		raw.value = parsed === null ? raw.value : String(parsed)
	}
}

/** Normalizes portfolio operation form payload before schema parse. */
export function normalizePortfolioOperationInput(
	raw: Record<string, unknown>,
): void {
	normalizePortfolioOperationValue(raw)
}

async function loadCatalogForPortfolioList(
	context: AppRequestContext,
): Promise<CatalogEntry[]> {
	const session = getSessionData(context.get(Session))
	if (session?.gistId && session.token) {
		try {
			const snapshot = await fetchPortfolioSnapshot(
				session.token,
				session.gistId,
			)
			return snapshot.catalog
		} catch {
			return fetchCatalog()
		}
	}
	return fetchCatalog()
}

async function portfolioListFragmentHtmlResponse(
	context: AppRequestContext,
	params: {
		entries: EtfEntry[]
		inlineError?: string
		status?: number
	},
) {
	const catalog = await loadCatalogForPortfolioList(context)
	return createHtmlResponse(
		renderToStream(
			jsx(ListFragment, {
				entries: params.entries,
				catalog,
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
	if (requestAcceptsApplicationJson(context.request)) {
		return new Response(JSON.stringify({ error: message }), {
			status: 422,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	if (requestAcceptsFrameSubmitHtml(context.request)) {
		const entries = await loadPortfolioEntries(context)
		return portfolioListFragmentHtmlResponse(context, {
			entries: entries ?? [],
			inlineError: message,
			status: 422,
		})
	}
	flashBanner(context.get(Session), { text: message, tone: 'error' })
	return createRedirectResponse(routes.portfolio.index.href())
}

function findExistingHoldingIndex(params: {
	current: EtfEntry[]
	normalizedCurrency: string
	normalizedTicker: string
	normalizedName: string
}): number {
	return params.current.findIndex((e) => {
		if (e.currency.toUpperCase() !== params.normalizedCurrency) return false
		if (e.ticker) {
			return e.ticker.toUpperCase() === params.normalizedTicker
		}
		return e.name.toLowerCase() === params.normalizedName
	})
}

export { ListFragment, PortfolioOperationForm }

export const portfolioOperationFormHandlers = {
	actions: {
		async create(context: AppRequestContext) {
			const form = context.get(FormData)
			if (!form) return createRedirectResponse(routes.portfolio.index.href())

			const formPayload = objectFromFormData(form)
			normalizePortfolioOperationInput(formPayload)

			const result = parseSafe(PortfolioOperationSchema, formPayload)
			if (!result.success) {
				const message = t('errors.portfolio.addInvalid')
				if (requestAcceptsApplicationJson(context.request)) {
					return new Response(JSON.stringify({ error: message }), {
						status: 422,
						headers: { 'Content-Type': 'application/json' },
					})
				}
				if (requestAcceptsFrameSubmitHtml(context.request)) {
					const entries = await loadPortfolioEntries(context)
					if (entries === null) {
						return portfolioListFragmentHtmlResponse(context, {
							entries: [],
							inlineError: t('errors.portfolio.persistence'),
							status: 422,
						})
					}
					return portfolioListFragmentHtmlResponse(context, {
						entries,
						inlineError: message,
						status: 422,
					})
				}
				flashBanner(context.get(Session), { text: message, tone: 'error' })
				return createRedirectResponse(routes.portfolio.index.href())
			}

			const operation = result.value
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

			const { instrumentTicker, value, currency } = operation
			const match = findCatalogEntryByTicker(catalog, instrumentTicker)
			if (!match) {
				const message = t('errors.portfolio.catalogEntryMissing')
				if (requestAcceptsApplicationJson(context.request)) {
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
				if (requestAcceptsFrameSubmitHtml(context.request)) {
					return portfolioListFragmentHtmlResponse(context, {
						entries: current,
						inlineError: message,
						status: 422,
					})
				}
				flashBanner(context.get(Session), { text: message, tone: 'error' })
				return createRedirectResponse(routes.portfolio.index.href())
			}

			const name = match.name
			const normalizedName = name.toLowerCase()
			const normalizedCurrency = currency.toUpperCase()
			const normalizedTicker = match.ticker.toUpperCase()
			const existingIndex = findExistingHoldingIndex({
				current,
				normalizedCurrency,
				normalizedTicker,
				normalizedName,
			})
			const existing = existingIndex >= 0 ? current[existingIndex] : null
			const ticker = match.ticker

			let updated: EtfEntry[]

			if (operation.portfolioOperation === 'buy') {
				const entry: EtfEntry = existing
					? {
							...existing,
							ticker: existing.ticker ?? ticker,
							value: existing.value + value,
						}
					: {
							id: crypto.randomUUID(),
							name,
							ticker,
							value,
							currency: normalizedCurrency,
						}
				updated =
					existingIndex >= 0
						? current.map((e, i) => (i === existingIndex ? entry : e))
						: [entry, ...current]
			} else {
				if (existingIndex < 0 || !existing) {
					const message = t('errors.portfolio.sellNoHolding')
					if (requestAcceptsApplicationJson(context.request)) {
						return new Response(JSON.stringify({ error: message }), {
							status: 422,
							headers: { 'Content-Type': 'application/json' },
						})
					}
					if (requestAcceptsFrameSubmitHtml(context.request)) {
						return portfolioListFragmentHtmlResponse(context, {
							entries: current,
							inlineError: message,
							status: 422,
						})
					}
					flashBanner(context.get(Session), { text: message, tone: 'error' })
					return createRedirectResponse(routes.portfolio.index.href())
				}

				const nextValue = existing.value - value
				if (nextValue < 0) {
					const message = t('errors.portfolio.sellExceedsHoldings')
					if (requestAcceptsApplicationJson(context.request)) {
						return new Response(JSON.stringify({ error: message }), {
							status: 422,
							headers: { 'Content-Type': 'application/json' },
						})
					}
					if (requestAcceptsFrameSubmitHtml(context.request)) {
						return portfolioListFragmentHtmlResponse(context, {
							entries: current,
							inlineError: message,
							status: 422,
						})
					}
					flashBanner(context.get(Session), { text: message, tone: 'error' })
					return createRedirectResponse(routes.portfolio.index.href())
				}

				if (nextValue === 0) {
					updated = current.filter((_, i) => i !== existingIndex)
				} else {
					const updatedEntry: EtfEntry = {
						...existing,
						ticker: existing.ticker ?? ticker,
						value: nextValue,
					}
					updated = current.map((e, i) =>
						i === existingIndex ? updatedEntry : e,
					)
				}
			}

			if (session?.gistId && session.token) {
				try {
					await saveEtfs(session.token, session.gistId, updated)
				} catch {
					return portfolioPersistenceFailureResponse(context)
				}
			} else {
				setGuestEtfs(context.get(Session), updated)
			}

			if (requestAcceptsFrameSubmitHtml(context.request)) {
				return portfolioListFragmentHtmlResponse(context, { entries: updated })
			}
			return createRedirectResponse(routes.portfolio.index.href())
		},
	},
}
