import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs } from '../../lib/gist.ts'
import { getGuestEtfs } from '../../lib/guest-session-state.ts'
import { format, t } from '../../lib/i18n.ts'
import { resolveRemixFrameContent } from '../../lib/remix-frame-resolve.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import type { SessionData } from '../../lib/session.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { getOrCreateAdviceClient } from '../advice/advice-client.ts'
import {
	ADVICE_MODEL_IDS,
	type AdviceModelId,
	DEFAULT_ADVICE_MODEL,
} from '../advice/advice-openai.ts'
import { CatalogEtfAnalysisFragment } from './catalog-etf-analysis-fragment.tsx'
import { getCatalogEtfDeepDiveText } from './catalog-etf-openai.ts'
import { CatalogEtfPage } from './catalog-etf-page.tsx'
import { CatalogPage } from './catalog-page.tsx'
import type { CatalogEntry } from './lib.ts'
import {
	fetchSharedCatalogSnapshot,
	isSharedCatalogAdmin,
	mergeBankIntoCatalog,
	parseBankJsonToCatalog,
	saveCatalog,
} from './lib.ts'

export { resetTestSessionCookieJar as resetGuestCatalog } from '../../lib/test-session-fetch.ts'

const catalogIndexRedirect = () =>
	createRedirectResponse(routes.catalog.index.href())

const CATALOG_ENTRY_ID_PARAM_MAX = 128

function normalizeCatalogEntryIdParam(raw: string | undefined): string | null {
	if (raw === undefined) return null
	const trimmed = raw.trim()
	if (trimmed.length === 0 || trimmed.length > CATALOG_ENTRY_ID_PARAM_MAX)
		return null
	return trimmed
}

function catalogEtfBackHref(request: Request): string {
	const referer = request.headers.get('Referer')
	if (referer) {
		try {
			const refererUrl = new URL(referer)
			const selfUrl = new URL(request.url)
			if (refererUrl.origin === selfUrl.origin) {
				return `${refererUrl.pathname}${refererUrl.search}`
			}
		} catch {
			/* ignore */
		}
	}
	return routes.catalog.index.href()
}

function parseOptionalAdviceModelFromUrl(url: string): AdviceModelId {
	const raw = new URL(url).searchParams.get('model')
	if (raw && (ADVICE_MODEL_IDS as readonly string[]).includes(raw)) {
		return raw as AdviceModelId
	}
	return DEFAULT_ADVICE_MODEL
}

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
			const rawEntryId = url.searchParams.get('catalogEntryId')
			const entryId = normalizeCatalogEntryIdParam(
				rawEntryId === null ? undefined : rawEntryId,
			)

			const session = getSessionData(context.get(Session))
			const layoutSession = getLayoutSession(context.get(Session))
			const [catalogSnapshot, entries] = await Promise.all([
				fetchSharedCatalogSnapshot(),
				session?.gistId && session.token
					? fetchEtfs(session.token, session.gistId)
					: getGuestEtfs(context.get(Session)),
			])

			if (entryId !== null) {
				const pendingApproval = layoutSession?.approvalStatus === 'pending'
				const backHref = catalogEtfBackHref(context.request)
				const entry = catalogSnapshot.entries.find((row) => row.id === entryId)
				if (entry === undefined) {
					return new Response('Not found', {
						status: 404,
						headers: { 'content-type': 'text/plain; charset=utf-8' },
					})
				}

				const fundName = entry.name

				if (pendingApproval) {
					return render({
						title: format(t('meta.title.catalogEtf'), { name: fundName }),
						session: layoutSession,
						currentPage: 'catalog',
						body: jsx(CatalogEtfPage, {
							entry,
							descriptionText: t('catalog.etfDetail.pendingBody'),
							backHref,
						}),
						init: { headers: { 'Cache-Control': 'no-store' } },
					})
				}

				const model = parseOptionalAdviceModelFromUrl(context.request.url)

				const analysisFrameSrc = routes.catalog.etfAnalysisFragment.href(
					{},
					{ catalogEntryId: entryId, model },
				)
				return render({
					title: format(t('meta.title.catalogEtf'), { name: fundName }),
					session: layoutSession,
					currentPage: 'catalog',
					body: jsx(CatalogEtfPage, {
						entry,
						analysisFrameSrc,
						descriptionText: '',
						backHref,
					}),
					init: { headers: { 'Cache-Control': 'no-store' } },
					resolveFrame: async (src) =>
						resolveRemixFrameContent(context.request, src),
				})
			}

			return renderCatalogPage({
				catalog: catalogSnapshot.entries,
				entries,
				session: layoutSession,
				pendingApproval: layoutSession?.approvalStatus === 'pending',
				canImport:
					session?.token !== null &&
					session?.token !== undefined &&
					isSharedCatalogAdmin({
						sessionLogin: layoutSession?.login,
						ownerLogin: catalogSnapshot.ownerLogin,
					}),
				sharedCatalogOwnerLogin: catalogSnapshot.ownerLogin,
				typeFilter,
				query,
				flashError: context.get(Session).get('error') as string | undefined,
			})
		},

		async etfAnalysisFragment(context: AppRequestContext) {
			const url = new URL(context.request.url)
			const rawEntryId = url.searchParams.get('catalogEntryId')
			const entryId = normalizeCatalogEntryIdParam(
				rawEntryId === null ? undefined : rawEntryId,
			)
			if (entryId === null) {
				return new Response('Bad request', {
					status: 400,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				})
			}

			const layoutSession = getLayoutSession(context.get(Session))
			if (layoutSession?.approvalStatus === 'pending') {
				const html = await renderToString(
					jsx(CatalogEtfAnalysisFragment, {
						descriptionText: t('catalog.etfDetail.pendingBody'),
					}),
				)
				return createHtmlResponse(html, {
					headers: { 'Cache-Control': 'no-store' },
				})
			}

			const catalogSnapshot = await fetchSharedCatalogSnapshot()
			const entry = catalogSnapshot.entries.find((row) => row.id === entryId)
			if (entry === undefined) {
				return new Response('Not found', {
					status: 404,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				})
			}

			const model = parseOptionalAdviceModelFromUrl(context.request.url)

			try {
				const client = getOrCreateAdviceClient()
				const descriptionText = await getCatalogEtfDeepDiveText({
					entry,
					client,
					model,
				})
				const html = await renderToString(
					jsx(CatalogEtfAnalysisFragment, { descriptionText }),
				)
				return createHtmlResponse(html, {
					headers: { 'Cache-Control': 'no-store' },
				})
			} catch (err) {
				console.error('[catalog] etf analysis fragment failed', err)
				const html = await renderToString(
					jsx(CatalogEtfAnalysisFragment, {
						descriptionText: '',
						serviceError: true,
					}),
				)
				return createHtmlResponse(html, {
					headers: { 'Cache-Control': 'no-store' },
				})
			}
		},

		async import(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			if (!session?.token || !session?.login) {
				context
					.get(Session)
					.flash('error', t('errors.catalog.importNotAllowed'))
				return catalogIndexRedirect()
			}
			const { ownerLogin, entries } = await fetchSharedCatalogSnapshot()
			const canImport = isSharedCatalogAdmin({
				sessionLogin: session.login,
				ownerLogin,
			})
			if (!canImport) {
				context
					.get(Session)
					.flash('error', t('errors.catalog.importNotAllowed'))
				return catalogIndexRedirect()
			}

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

			const merged = mergeBankIntoCatalog(entries, imported)
			await saveCatalog({ token: session.token, entries: merged })

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
	pendingApproval?: boolean
	canImport: boolean
	sharedCatalogOwnerLogin: string | null
	typeFilter: string
	query: string
	flashError?: string
}) {
	const {
		catalog,
		entries,
		session,
		pendingApproval,
		canImport,
		sharedCatalogOwnerLogin,
		typeFilter,
		query,
		flashError,
	} = params
	const body = jsx(CatalogPage, {
		catalog,
		holdings: entries,
		pendingApproval,
		canImport,
		typeFilter,
		query,
		sharedCatalogOwnerLogin,
	})
	return render({
		title: t('meta.title.catalog'),
		session,
		currentPage: 'catalog',
		body,
		flashError,
	})
}
