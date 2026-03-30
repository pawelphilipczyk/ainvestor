import { jsx } from 'remix/component/jsx-runtime'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs } from '../../lib/gist.ts'
import {
	getGuestCatalog,
	getGuestEtfs,
	setGuestCatalog,
} from '../../lib/guest-session-state.ts'
import { t } from '../../lib/i18n.ts'
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

/**
 * Parses JSON for catalog import. When `allowEmptyInput` is true (raw request
 * body), a missing/empty body yields `null`; otherwise invalid JSON redirects.
 * When false (form field), trimmed empty or invalid JSON redirects.
 */
async function parseJsonOrRedirect(
	source: string | Promise<string>,
	allowEmptyInput: boolean,
): Promise<unknown | Response> {
	const text = typeof source === 'string' ? source : await source
	if (allowEmptyInput) {
		if (!text) return null
		try {
			return JSON.parse(text)
		} catch {
			return catalogIndexRedirect()
		}
	}
	const trimmed = text.trim()
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
	async index(context: { request: Request; session: Session }) {
		const url = new URL(context.request.url)
		const typeFilter = url.searchParams.get('type') ?? ''
		const query = url.searchParams.get('q') ?? ''

		const session = getSessionData(context.session)
		const layoutSession = getLayoutSession(context.session)
		const [catalog, entries] = await Promise.all([
			session?.gistId && session.token
				? fetchCatalog(session.token, session.gistId)
				: getGuestCatalog(context.session),
			session?.gistId && session.token
				? fetchEtfs(session.token, session.gistId)
				: getGuestEtfs(context.session),
		])

		return renderCatalogPage({
			catalog,
			entries,
			session: layoutSession,
			typeFilter,
			query,
		})
	},

	async import(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const rawFromForm = context.formData?.get('bankApiJson')
		const parsed =
			typeof rawFromForm === 'string'
				? await parseJsonOrRedirect(rawFromForm, false)
				: await parseJsonOrRedirect(context.request.text(), true)
		if (parsed instanceof Response) return parsed
		const json = parsed

		const imported = parseBankJsonToCatalog(json)
		if (imported.length === 0)
			return createRedirectResponse(routes.catalog.index.href())

		const session = getSessionData(context.session)
		const existing =
			session?.gistId && session.token
				? await fetchCatalog(session.token, session.gistId)
				: getGuestCatalog(context.session)
		const merged = mergeBankIntoCatalog(existing, imported)

		if (session?.gistId && session.token) {
			await saveCatalog(session.token, session.gistId, merged)
		} else {
			setGuestCatalog(context.session, merged)
		}

		return createRedirectResponse(routes.catalog.index.href())
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
