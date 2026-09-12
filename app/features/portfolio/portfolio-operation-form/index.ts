import { parseSafe } from 'remix/data-schema'
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
import {
	applyPortfolioOperation,
	normalizePortfolioOperationInput,
	PortfolioOperationSchema,
} from '../../../lib/portfolio-operations.ts'
import type { AppRequestContext } from '../../../lib/request-context.ts'
import { getSessionData } from '../../../lib/session.ts'
import { flashBanner } from '../../../lib/session-flash.ts'
import { routes } from '../../../routes.ts'
import { type CatalogEntry, fetchCatalog } from '../../catalog/lib.ts'
import { ListFragment } from './list-fragment.tsx'
import { PortfolioOperationForm } from './operation-form.tsx'

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

/**
 * JSON/frame-HTML/flash+redirect response for a validation failure that
 * happens before any holdings snapshot has been loaded for this request —
 * reloads entries fresh for the frame-HTML branch, falling back to a
 * persistence-error banner if that reload itself fails. Shared by the trade
 * form's schema validation and CSV import's "no valid rows" case, so the
 * three-way `Accept` branching lives in one place.
 */
async function portfolioValidationFailureResponse(
	context: AppRequestContext,
	message: string,
): Promise<Response> {
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

export {
	ListFragment,
	loadPortfolioEntries,
	PortfolioOperationForm,
	portfolioListFragmentHtmlResponse,
	portfolioPersistenceFailureResponse,
	portfolioValidationFailureResponse,
}

export const portfolioOperationFormHandlers = {
	actions: {
		async create(context: AppRequestContext) {
			const form = context.get(FormData)
			if (!form) return createRedirectResponse(routes.portfolio.index.href())

			const formPayload = objectFromFormData(form)
			normalizePortfolioOperationInput(formPayload)

			const result = parseSafe(PortfolioOperationSchema, formPayload)
			if (!result.success) {
				return portfolioValidationFailureResponse(
					context,
					t('errors.portfolio.addInvalid'),
				)
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
			const outcome = applyPortfolioOperation({
				current,
				catalog,
				input: {
					portfolioOperation: operation.portfolioOperation,
					instrumentTicker,
					value,
					currency,
				},
			})

			if (!outcome.applied) {
				const message = t(
					outcome.blocker === 'catalog_entry_missing'
						? 'errors.portfolio.catalogEntryMissing'
						: outcome.blocker === 'sell_no_holding'
							? 'errors.portfolio.sellNoHolding'
							: 'errors.portfolio.sellExceedsHoldings',
				)
				if (requestAcceptsApplicationJson(context.request)) {
					return new Response(
						JSON.stringify({
							error: message,
							...(outcome.blocker === 'catalog_entry_missing'
								? {
										instrumentTicker: instrumentTicker.trim(),
										...(session?.gistId && session.token
											? { gistId: session.gistId }
											: {}),
									}
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

			const updated = outcome.holdings

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
