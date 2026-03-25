import { jsx } from 'remix/component/jsx-runtime'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs, fetchPortfolioSnapshot, saveEtfs } from '../../lib/gist.ts'
import {
	getGuestCatalog,
	getGuestEtfs,
	setGuestEtfs,
} from '../../lib/guest-session-state.ts'
import { decodeCsvBytes, parsePortfolioCsv } from '../../lib/portfolio-csv.ts'
import type { SessionData } from '../../lib/session.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import type { CatalogEntry } from '../catalog/lib.ts'
import { instrumentSelectOptionsFromCatalog } from '../catalog/lib.ts'
import { addEtfFormHandlers } from './add-etf-form/index.ts'
import { PortfolioPage } from './portfolio-page.tsx'

export { resetEtfEntries, resetTestSessionCookieJar } from './state.ts'

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const portfolioController = {
	async index(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const layoutSession = getLayoutSession(context.session)
		const flashError = context.session.get('error') as string | undefined
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
			entries: getGuestEtfs(context.session),
			session: layoutSession,
			flashError,
			catalog: getGuestCatalog(context.session),
		})
	},

	async fragmentList(context: { request: Request; session: Session }) {
		return addEtfFormHandlers.fragmentList(context)
	},

	async create(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		return addEtfFormHandlers.create(context)
	},

	async import(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
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

		const session = getSessionData(context.session)
		const current =
			session?.gistId && session.token
				? await fetchEtfs(session.token, session.gistId)
				: getGuestEtfs(context.session)

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

		if (session?.gistId && session.token) {
			await saveEtfs(session.token, session.gistId, updated)
		} else {
			setGuestEtfs(context.session, updated)
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

		if (session?.gistId && session.token) {
			const current = await fetchEtfs(session.token, session.gistId)
			await saveEtfs(
				session.token,
				session.gistId,
				current.filter((e) => e.id !== id),
			)
		} else {
			const filtered = getGuestEtfs(context.session).filter((e) => e.id !== id)
			setGuestEtfs(context.session, filtered)
		}

		return createRedirectResponse(routes.portfolio.index.href())
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
	const body = jsx(PortfolioPage, { entries, instrumentOptions })
	return render({
		title: 'AI Investor',
		session,
		currentPage: 'portfolio',
		body,
		flashError,
		init: { headers: { 'Cache-Control': 'no-store' } },
	})
}
