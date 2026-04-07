import { jsx } from 'remix/component/jsx-runtime'
import { renderToStream } from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs, fetchPortfolioSnapshot, saveEtfs } from '../../lib/gist.ts'
import { getGuestEtfs, setGuestEtfs } from '../../lib/guest-session-state.ts'
import { t } from '../../lib/i18n.ts'
import { decodeCsvBytes, parsePortfolioCsv } from '../../lib/portfolio-csv.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import type { SessionData } from '../../lib/session.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import type { CatalogEntry } from '../catalog/lib.ts'
import {
	fetchCatalog,
	instrumentSelectOptionsFromCatalog,
} from '../catalog/lib.ts'
import {
	ListFragment,
	portfolioOperationFormHandlers,
} from './portfolio-operation-form/index.ts'
import { PortfolioPage } from './portfolio-page.tsx'

export { resetEtfEntries, resetTestSessionCookieJar } from './state.ts'

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const portfolioController = {
	actions: {
		async index(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			const layoutSession = getLayoutSession(context.get(Session))
			const flashError = context.get(Session).get('error') as string | undefined
			if (session?.gistId && session.token) {
				const { entries, catalog } = await fetchPortfolioSnapshot(
					session.token,
					session.gistId,
				)
				return renderPage({
					entries,
					session: layoutSession,
					flashError,
					catalog,
				})
			}
			return renderPage({
				entries: getGuestEtfs(context.get(Session)),
				session: layoutSession,
				flashError,
				catalog: await fetchCatalog(),
			})
		},

		async fragmentList(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			const entries =
				session?.gistId && session.token
					? await fetchEtfs(session.token, session.gistId)
					: getGuestEtfs(context.get(Session))
			return createHtmlResponse(
				renderToStream(jsx(ListFragment, { entries })),
				{ headers: { 'Cache-Control': 'no-store' } },
			)
		},

		async create(context: AppRequestContext) {
			return portfolioOperationFormHandlers.actions.create(context)
		},

		async import(context: AppRequestContext) {
			const form = context.get(FormData)
			if (!form) return createRedirectResponse(routes.portfolio.index.href())

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

			if (!csvText) return createRedirectResponse(routes.portfolio.index.href())
			const imported = parsePortfolioCsv(csvText)
			if (imported.length === 0)
				return createRedirectResponse(routes.portfolio.index.href())

			const session = getSessionData(context.get(Session))
			const current =
				session?.gistId && session.token
					? await fetchEtfs(session.token, session.gistId)
					: getGuestEtfs(context.get(Session))

			// Merge imported with existing (same name+currency: add values)
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
			const updated = Array.from(byKey.values())

			if (session?.gistId && session.token) {
				await saveEtfs(session.token, session.gistId, updated)
			} else {
				setGuestEtfs(context.get(Session), updated)
			}

			return createRedirectResponse(routes.portfolio.index.href())
		},

		async delete(context: AppRequestContext) {
			const id = (context.params as Record<string, string>).id
			if (!id) return createRedirectResponse(routes.portfolio.index.href())

			const session = getSessionData(context.get(Session))

			if (session?.gistId && session.token) {
				const current = await fetchEtfs(session.token, session.gistId)
				await saveEtfs(
					session.token,
					session.gistId,
					current.filter((entry) => entry.id !== id),
				)
			} else {
				const filtered = getGuestEtfs(context.get(Session)).filter(
					(entry) => entry.id !== id,
				)
				setGuestEtfs(context.get(Session), filtered)
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
	flashError?: string
	catalog: CatalogEntry[]
}

async function renderPage(params: RenderPortfolioPageParams) {
	const { entries, session, flashError, catalog } = params
	const instrumentOptions = instrumentSelectOptionsFromCatalog(catalog)
	const body = jsx(PortfolioPage, { instrumentOptions })
	return render({
		title: t('meta.title.portfolio'),
		session,
		currentPage: 'portfolio',
		body,
		flashError,
		init: { headers: { 'Cache-Control': 'no-store' } },
		resolveFrame(source) {
			if (source === routes.portfolio.fragmentList.href()) {
				return renderToStream(jsx(ListFragment, { entries }))
			}
			return ''
		},
	})
}
