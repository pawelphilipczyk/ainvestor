import { jsx } from 'remix/component/jsx-runtime'
import { renderToStream } from 'remix/component/server'
import { literal, object, parseSafe, string, variant } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { objectFromFormData } from '../../../lib/form-data-payload.ts'
import type { EtfEntry } from '../../../lib/gist.ts'
import { fetchPortfolioSnapshot, saveEtfs } from '../../../lib/gist.ts'
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
import { PortfolioBuySellForm } from './buy-sell-form.tsx'
import { ListFragment } from './list-fragment.tsx'

const portfolioBuyFields = {
	instrumentTicker: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
}

export const PortfolioBuySchema = object({
	portfolioAction: literal('buy'),
	...portfolioBuyFields,
})

export const PortfolioSellSchema = object({
	portfolioAction: literal('sell'),
	...portfolioBuyFields,
	value: coerce
		.number()
		.pipe(min(0))
		.refine((n) => n > 0, t('errors.portfolio.sellValueNotPositive')),
})

export const PortfolioTradeSchema = variant('portfolioAction', {
	buy: PortfolioBuySchema,
	sell: PortfolioSellSchema,
})

/** @deprecated Use {@link PortfolioBuySchema} — same shape for tests and tools. */
export const CreateEtfSchema = object({
	instrumentTicker: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
})

function normalizePortfolioTradeValue(raw: Record<string, unknown>): void {
	if (typeof raw.value === 'string') {
		const parsed = parseLocaleDecimalString(raw.value)
		raw.value = parsed === null ? raw.value : String(parsed)
	}
}

/** Normalizes buy/sell form payload before schema parse. */
export function normalizePortfolioTradeInput(
	raw: Record<string, unknown>,
): void {
	normalizePortfolioTradeValue(raw)
}

/** @deprecated Use {@link normalizePortfolioTradeInput}. */
export function normalizeAddEtfInput(raw: Record<string, unknown>): void {
	normalizePortfolioTradeInput(raw)
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

export { ListFragment, PortfolioBuySellForm }

export const addEtfFormHandlers = {
	actions: {
		async create(context: AppRequestContext) {
			const form = context.get(FormData)
			if (!form) return createRedirectResponse(routes.portfolio.index.href())

			const formPayload = objectFromFormData(form)
			normalizePortfolioTradeInput(formPayload)

			const result = parseSafe(PortfolioTradeSchema, formPayload)
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

			const trade = result.value
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

			const { instrumentTicker, value, currency } = trade
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
			const existingIndex = findExistingHoldingIndex({
				current,
				normalizedCurrency,
				normalizedTicker,
				normalizedName,
			})
			const existing = existingIndex >= 0 ? current[existingIndex] : null
			const ticker = match.ticker

			let updated: EtfEntry[]

			if (trade.portfolioAction === 'buy') {
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

				const nextValue = existing.value - value
				if (nextValue < 0) {
					const message = t('errors.portfolio.sellExceedsHoldings')
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

			if (prefersHtmlFrame(context.request)) {
				return portfolioListFragmentHtmlResponse({ entries: updated })
			}
			return createRedirectResponse(routes.portfolio.index.href())
		},
	},
}
