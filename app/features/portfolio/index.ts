import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { jsx } from 'remix/ui/jsx-runtime'
import { render, renderFragmentToStream } from '../../components/render.ts'
import { requestAcceptsFrameSubmitHtml } from '../../lib/frame-submit-request.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import {
	fetchEtfs,
	fetchPortfolioSnapshot,
	updateEtfs,
} from '../../lib/gist.ts'
import { t } from '../../lib/i18n.ts'
import { decodeCsvBytes, parsePortfolioCsv } from '../../lib/portfolio-csv.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import type { SessionData } from '../../lib/session.ts'
import {
	getLayoutSession,
	getSessionData,
	sessionHasDataRepo,
} from '../../lib/session.ts'
import {
	type FlashedBanner,
	flashBanner,
	readFlashedBanner,
} from '../../lib/session-flash.ts'
import { commitMessage } from '../../lib/store/commit-message.ts'
import { WriteConflictError } from '../../lib/store/read-modify-write.ts'
import { htmlLangForCurrentUiLocale } from '../../lib/ui-locale.ts'
import { routes } from '../../routes.ts'
import type { CatalogEntry } from '../catalog/lib.ts'
import {
	fetchCatalog,
	instrumentSelectOptionsFromCatalog,
} from '../catalog/lib.ts'
import {
	ListFragment,
	portfolioListFragmentHtmlResponse,
	portfolioOperationFormHandlers,
	portfolioSaveFailureResponse,
	portfolioValidationFailureResponse,
} from './portfolio-operation-form/index.ts'
import { PortfolioPage } from './portfolio-page.tsx'

export { resetTestSessionCookieJar } from './state.ts'

/**
 * Discriminates the two actions the single `portfolio.action` route handles,
 * via a hidden `portfolioIntent` field on each `<form>` — same shape as
 * `advice`'s `adviceIntent` / `guidelines`' `guidelineIntent`. Consolidating
 * the trade form and the CSV import form onto one POST route
 * (`form('portfolio')` in `routes.ts`) keeps both forms' `action` equal to
 * the page's own URL, which native `data-rmx-target` submission requires —
 * see `docs/UI_ARCHITECTURE_GUIDELINES.md` §10.
 */
const PORTFOLIO_INTENTS = ['trade', 'import'] as const

/** Merge imported rows into the holdings: the same name and currency adds the values. */
function mergeImportedHoldings(
	current: EtfEntry[],
	imported: EtfEntry[],
): EtfEntry[] {
	const byKey = new Map<string, EtfEntry>()
	for (const entry of current) {
		byKey.set(`${entry.name.toLowerCase()}:${entry.currency}`, entry)
	}
	for (const importedEntry of imported) {
		const key = `${importedEntry.name.toLowerCase()}:${importedEntry.currency}`
		const existing = byKey.get(key)
		if (existing) {
			byKey.set(key, {
				...existing,
				value: existing.value + importedEntry.value,
				exchange: existing.exchange || importedEntry.exchange || undefined,
			})
		} else {
			byKey.set(key, importedEntry)
		}
	}
	return Array.from(byKey.values())
}

async function handleImport(context: AppRequestContext, form: FormData) {
	const pasteRaw = form.get('portfolioCsvPaste')
	const paste =
		typeof pasteRaw === 'string' && pasteRaw.trim().length > 0
			? pasteRaw.trim()
			: null

	const file = form.get('portfolioCsv')
	let csvText: string | null = null

	if (file && typeof file !== 'string' && (file as Blob).size > 0) {
		const bytes = await (file as Blob).arrayBuffer()
		csvText = decodeCsvBytes(bytes)
	} else if (paste) {
		csvText = paste
	}

	const imported = csvText ? parsePortfolioCsv(csvText) : []
	if (imported.length === 0) {
		return portfolioValidationFailureResponse(
			context,
			t('errors.portfolio.importInvalid'),
		)
	}

	const session = getSessionData(context.get(Session))
	if (!sessionHasDataRepo(session)) {
		return portfolioValidationFailureResponse(
			context,
			t('errors.portfolio.requiresApproval'),
		)
	}

	// updateEtfs saves only if the holdings are still the version it read,
	// merging the import into newer ones when another client saved first.
	let updated: EtfEntry[]
	try {
		updated = await updateEtfs({
			token: session.token,
			dataRepo: session.dataRepo,
			change: (current) => {
				const merged = mergeImportedHoldings(current, imported)
				return {
					write: merged,
					message: commitMessage({
						summary: `Import portfolio CSV (${imported.length} rows)`,
						source: 'web',
					}),
					result: merged,
				}
			},
		})
	} catch (error) {
		return portfolioSaveFailureResponse(context, error)
	}

	if (requestAcceptsFrameSubmitHtml(context.request)) {
		return portfolioListFragmentHtmlResponse(context, { entries: updated })
	}
	return createRedirectResponse(routes.portfolio.index.href())
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const portfolioController = {
	actions: {
		async index(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			const layoutSession = getLayoutSession(context.get(Session))
			const flashedBanner = readFlashedBanner(context.get(Session))
			// Pending approval: the page renders with its own notice and no rows,
			// because there is no store to read until the login is approved.
			if (!sessionHasDataRepo(session)) {
				return renderPage(context, {
					entries: [],
					session: layoutSession,
					flashBanner: flashedBanner,
					catalog: await fetchCatalog(session?.token ?? null),
				})
			}
			try {
				const { entries, catalog } = await fetchPortfolioSnapshot(
					session.token,
					session.dataRepo,
				)
				return renderPage(context, {
					entries,
					session: layoutSession,
					flashBanner: flashedBanner,
					catalog,
				})
			} catch {
				const catalog = await fetchCatalog(session.token)
				return renderPage(context, {
					entries: [],
					session: layoutSession,
					flashBanner: {
						text: t('errors.portfolio.persistence'),
						tone: 'error',
					},
					catalog,
				})
			}
		},

		async fragmentList(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			if (!sessionHasDataRepo(session)) {
				return createHtmlResponse(
					renderFragmentToStream(
						jsx(ListFragment, {
							entries: [],
							catalog: await fetchCatalog(session?.token ?? null),
						}),
					),
					{ headers: { 'Cache-Control': 'no-store' } },
				)
			}
			let entries: EtfEntry[]
			let inlineError: string | undefined
			try {
				entries = await fetchEtfs(session.token, session.dataRepo)
			} catch {
				entries = []
				inlineError = t('errors.portfolio.persistence')
			}
			let catalog: CatalogEntry[]
			try {
				const snapshot = await fetchPortfolioSnapshot(
					session.token,
					session.dataRepo,
				)
				catalog = snapshot.catalog
			} catch {
				catalog = await fetchCatalog(session.token)
			}
			return createHtmlResponse(
				renderFragmentToStream(
					jsx(ListFragment, {
						entries,
						catalog,
						...(inlineError !== undefined ? { inlineError } : {}),
					}),
				),
				{ headers: { 'Cache-Control': 'no-store' } },
			)
		},

		async action(context: AppRequestContext) {
			const form = context.get(FormData)
			if (!form) return createRedirectResponse(routes.portfolio.index.href())

			const intent = form.get('portfolioIntent')
			switch (intent as (typeof PORTFOLIO_INTENTS)[number] | null) {
				case 'trade':
					return portfolioOperationFormHandlers.actions.create(context)
				case 'import':
					return handleImport(context, form)
				default:
					return createRedirectResponse(routes.portfolio.index.href())
			}
		},

		async delete(context: AppRequestContext) {
			const id = (context.params as Record<string, string>).id
			if (!id) return createRedirectResponse(routes.portfolio.index.href())

			const session = getSessionData(context.get(Session))
			if (!sessionHasDataRepo(session)) {
				return createRedirectResponse(routes.portfolio.index.href())
			}

			try {
				await updateEtfs({
					token: session.token,
					dataRepo: session.dataRepo,
					change: (current) => {
						const removed = current.find((entry) => entry.id === id)
						// Already gone (removed elsewhere): nothing to save.
						if (removed === undefined) return { result: null }
						return {
							write: current.filter((entry) => entry.id !== id),
							message: commitMessage({
								summary: `Remove holding ${removed.name}`,
								source: 'web',
							}),
							result: null,
						}
					},
				})
			} catch (error) {
				flashBanner(context.get(Session), {
					text:
						error instanceof WriteConflictError
							? t('errors.portfolio.changedElsewhere')
							: t('errors.portfolio.persistence'),
					tone: 'error',
				})
			}

			return createRedirectResponse(routes.portfolio.index.href())
		},
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
type RenderPortfolioPageParams = {
	entries: EtfEntry[]
	session: SessionData | null
	flashBanner?: FlashedBanner
	catalog: CatalogEntry[]
}

async function renderPage(
	context: AppRequestContext,
	params: RenderPortfolioPageParams,
) {
	const { entries, session, flashBanner, catalog } = params
	const instrumentOptions = instrumentSelectOptionsFromCatalog(catalog)
	const body = jsx(PortfolioPage, { instrumentOptions })
	return render(context, {
		title: t('meta.title.portfolio'),
		htmlLang: htmlLangForCurrentUiLocale(),
		session,
		currentPage: 'portfolio',
		body,
		flashBanner,
		init: { headers: { 'Cache-Control': 'no-store' } },
		resolveFrame(source) {
			if (source === routes.portfolio.fragmentList.href()) {
				return renderFragmentToStream(
					jsx(ListFragment, { entries, catalog: params.catalog }),
				)
			}
			return ''
		},
	})
}
