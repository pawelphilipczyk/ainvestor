import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { html } from 'remix/html-template'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import { pageShell } from '../../components/page-shell.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs } from '../../lib/gist.ts'
import type { SessionData } from '../../lib/session.ts'
import { getSessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { getGuestEntries } from '../portfolio/index.ts'
import { CatalogPage } from './catalog-page.tsx'
import type { CatalogEntry } from './lib.ts'
import {
	fetchCatalog,
	mergeBankIntoCatalog,
	parseBankJsonToCatalog,
	saveCatalog,
} from './lib.ts'

// ---------------------------------------------------------------------------
// Guest state
// ---------------------------------------------------------------------------
let guestCatalog: CatalogEntry[] = []

export function resetGuestCatalog() {
	guestCatalog = []
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const catalogController = {
	async index(context: { request: Request; session: Session }) {
		const url = new URL(context.request.url)
		const typeFilter = url.searchParams.get('type') ?? ''
		const query = url.searchParams.get('q') ?? ''

		const session = getSessionData(context.session)
		const [catalog, entries] = await Promise.all([
			session?.gistId
				? fetchCatalog(session.token, session.gistId)
				: guestCatalog,
			session?.gistId
				? fetchEtfs(session.token, session.gistId)
				: getGuestEntries(),
		])

		return renderCatalogPage(catalog, entries, session, typeFilter, query)
	},

	async import(context: { request: Request; session: Session }) {
		let json: unknown
		try {
			const text = await context.request.text()
			json = text ? JSON.parse(text) : null
		} catch {
			return createRedirectResponse(routes.catalog.index.href())
		}

		const imported = parseBankJsonToCatalog(json)
		if (imported.length === 0)
			return createRedirectResponse(routes.catalog.index.href())

		const session = getSessionData(context.session)
		const existing = session?.gistId
			? await fetchCatalog(session.token, session.gistId)
			: guestCatalog
		const merged = mergeBankIntoCatalog(existing, imported)

		if (session?.gistId) {
			await saveCatalog(session.token, session.gistId, merged)
		} else {
			guestCatalog = merged
		}

		return createRedirectResponse(routes.catalog.index.href())
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
async function renderCatalogPage(
	catalog: CatalogEntry[],
	holdings: EtfEntry[],
	session: SessionData | null,
	typeFilter: string,
	query: string,
) {
	const bodyMarkup = await renderToString(
		jsx(CatalogPage, {
			catalog,
			holdings,
			session,
			typeFilter,
			query,
		}),
	)
	const body = html.raw`${bodyMarkup}`
	return createHtmlResponse(
		await pageShell('AI Investor – ETF Catalog', session, 'catalog', body),
	)
}
