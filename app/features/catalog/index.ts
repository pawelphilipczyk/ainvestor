import { jsx } from 'remix/component/jsx-runtime'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs } from '../../lib/gist.ts'
import {
	getGuestCatalog,
	getGuestEtfs,
	setGuestCatalog,
} from '../../lib/guest-session-state.ts'
import { t } from '../../lib/i18n.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import type { SessionData } from '../../lib/session.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { CatalogPage } from './catalog-page.tsx'
import type { CatalogEntry } from './lib.ts'
import {
	fetchCatalog,
	mergeBankIntoCatalog,
	parseBankJsonToCatalog,
	saveCatalog,
} from './lib.ts'

export { resetTestSessionCookieJar as resetGuestCatalog } from '../../lib/test-session-fetch.ts'

const catalogIndexRedirect = () =>
	createRedirectResponse(routes.catalog.index.href())

/** Parses `bankApiJson` form field; empty or invalid JSON yields a redirect response. */
async function parseBankJsonField(raw: string): Promise<unknown | Response> {
	const trimmed = raw.trim()
	if (trimmed.length === 0) return catalogIndexRedirect()
	try {
		return JSON.parse(trimmed)
	} catch {
		return catalogIndexRedirect()
	}
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const catalogController = {
	actions: {
		async index(context: AppRequestContext) {
			const url = new URL(context.request.url)
			const typeFilter = url.searchParams.get('type') ?? ''
			const query = url.searchParams.get('q') ?? ''

			const session = getSessionData(context.get(Session))
			const layoutSession = getLayoutSession(context.get(Session))
			const [catalog, entries] = await Promise.all([
				session?.gistId && session.token
					? fetchCatalog(session.token, session.gistId)
					: getGuestCatalog(context.get(Session)),
				session?.gistId && session.token
					? fetchEtfs(session.token, session.gistId)
					: getGuestEtfs(context.get(Session)),
			])

			return renderCatalogPage({
				catalog,
				entries,
				session: layoutSession,
				typeFilter,
				query,
			})
		},

		async import(context: AppRequestContext) {
			const rawFromForm = context.get(FormData)?.get('bankApiJson')
			if (typeof rawFromForm !== 'string') {
				return catalogIndexRedirect()
			}
			const parsed = await parseBankJsonField(rawFromForm)
			if (parsed instanceof Response) return parsed
			const json = parsed

			const imported = parseBankJsonToCatalog(json)
			if (imported.length === 0)
				return createRedirectResponse(routes.catalog.index.href())

			const session = getSessionData(context.get(Session))
			const existing =
				session?.gistId && session.token
					? await fetchCatalog(session.token, session.gistId)
					: getGuestCatalog(context.get(Session))
			const merged = mergeBankIntoCatalog(existing, imported)

			if (session?.gistId && session.token) {
				await saveCatalog(session.token, session.gistId, merged)
			} else {
				setGuestCatalog(context.get(Session), merged)
			}

			return createRedirectResponse(routes.catalog.index.href())
		},
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
async function renderCatalogPage(params: {
	catalog: CatalogEntry[]
	entries: EtfEntry[]
	session: SessionData | null
	typeFilter: string
	query: string
}) {
	const { catalog, entries, session, typeFilter, query } = params
	const body = jsx(CatalogPage, {
		catalog,
		holdings: entries,
		typeFilter,
		query,
	})
	return render({
		title: t('meta.title.catalog'),
		session,
		currentPage: 'catalog',
		body,
	})
}
