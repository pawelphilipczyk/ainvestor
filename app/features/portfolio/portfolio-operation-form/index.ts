import { parseSafe } from 'remix/data-schema'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderFragmentToStream } from '../../../components/render.ts'
import type { EtfEntry } from '../../../lib/etfs.ts'
import { fetchPortfolioSnapshot, updateEtfs } from '../../../lib/etfs.ts'
import { objectFromFormData } from '../../../lib/form-data-payload.ts'
import {
	requestAcceptsApplicationJson,
	requestAcceptsFrameSubmitHtml,
} from '../../../lib/frame-submit-request.ts'
import { t } from '../../../lib/i18n.ts'
import {
	applyPortfolioOperation,
	normalizePortfolioOperationInput,
	type PortfolioOperationOutcome,
	PortfolioOperationSchema,
} from '../../../lib/portfolio-operations.ts'
import type { AppRequestContext } from '../../../lib/request-context.ts'
import { getSessionData, sessionHasDataRepo } from '../../../lib/session.ts'
import { flashBanner } from '../../../lib/session-flash.ts'
import {
	commitMessage,
	describePortfolioOperation,
} from '../../../lib/store/commit-message.ts'
import { WriteConflictError } from '../../../lib/store/read-modify-write.ts'
import { routes } from '../../../routes.ts'
import { type CatalogEntry, fetchCatalog } from '../../catalog/lib.ts'
import { ListFragment } from './list-fragment.tsx'
import { PortfolioOperationForm } from './operation-form.tsx'

async function loadCatalogForPortfolioList(
	context: AppRequestContext,
): Promise<CatalogEntry[]> {
	const session = getSessionData(context.get(Session))
	if (!sessionHasDataRepo(session)) return fetchCatalog(session?.token ?? null)
	try {
		const snapshot = await fetchPortfolioSnapshot(
			session.token,
			session.dataRepo,
		)
		return snapshot.catalog
	} catch {
		return fetchCatalog(session.token)
	}
}

/** What one buy or sell did, and the rows the page should show next. */
type OperationEdit = {
	outcome: PortfolioOperationOutcome
	holdings: EtfEntry[]
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
		renderFragmentToStream(
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
 * Loads current holdings for the session. Returns `null` when the repository snapshot
 * cannot be read (same class of failure as save errors).
 */
async function loadPortfolioEntries(
	context: AppRequestContext,
): Promise<EtfEntry[] | null> {
	const session = getSessionData(context.get(Session))
	// Pending approval: no store to read, so no rows — not a read failure.
	if (!sessionHasDataRepo(session)) return []
	try {
		const snapshot = await fetchPortfolioSnapshot(
			session.token,
			session.dataRepo,
		)
		return snapshot.entries
	} catch {
		return null
	}
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
 * The response for a save that did not happen: a lost race (the holdings kept
 * changing underneath it) says so and asks for a reload, anything else is the
 * generic persistence failure.
 */
async function portfolioSaveFailureResponse(
	context: AppRequestContext,
	error: unknown,
): Promise<Response> {
	if (error instanceof WriteConflictError) {
		return portfolioValidationFailureResponse(
			context,
			t('errors.portfolio.changedElsewhere'),
		)
	}
	return portfolioPersistenceFailureResponse(context)
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
	portfolioSaveFailureResponse,
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
			if (!sessionHasDataRepo(session)) {
				return portfolioValidationFailureResponse(
					context,
					t('errors.portfolio.requiresApproval'),
				)
			}

			const catalog = await fetchCatalog(session.token)

			const { instrumentTicker, value, currency } = operation
			const input = {
				portfolioOperation: operation.portfolioOperation,
				instrumentTicker,
				value,
				currency,
			}
			// updateEtfs saves only if the holdings are still the version it read,
			// redoing the operation on newer ones when another client saved first.
			// `holdings` is what the page should show next: the result of the
			// operation, or — when it is refused — the rows the refusal was decided
			// on, not an earlier read.
			let edit: OperationEdit
			try {
				edit = await updateEtfs<OperationEdit>({
					token: session.token,
					dataRepo: session.dataRepo,
					change: (fresh) => {
						const applied = applyPortfolioOperation({
							current: fresh,
							catalog,
							input,
						})
						if (!applied.applied) {
							return { result: { outcome: applied, holdings: fresh } }
						}
						return {
							write: applied.holdings,
							message: commitMessage({
								summary: describePortfolioOperation(input),
								source: 'web',
							}),
							result: { outcome: applied, holdings: applied.holdings },
						}
					},
				})
			} catch (error) {
				return portfolioSaveFailureResponse(context, error)
			}
			const { outcome, holdings } = edit

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
										dataRepo: session.dataRepo,
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
						entries: holdings,
						inlineError: message,
						status: 422,
					})
				}
				flashBanner(context.get(Session), { text: message, tone: 'error' })
				return createRedirectResponse(routes.portfolio.index.href())
			}

			if (requestAcceptsFrameSubmitHtml(context.request)) {
				return portfolioListFragmentHtmlResponse(context, { entries: holdings })
			}
			return createRedirectResponse(routes.portfolio.index.href())
		},
	},
}
