import { jsx } from 'remix/component/jsx-runtime'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { format, t } from '../../lib/i18n.ts'
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
import { getCatalogEtfDeepDiveText } from './catalog-etf-openai.ts'
import { CatalogEtfPage } from './catalog-etf-page.tsx'
import {
	catalogCanImport,
	loadCatalogPageContext,
} from './catalog-load-context.ts'
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

function parseAdviceModelFromJsonBody(body: unknown): AdviceModelId {
	if (body === null || typeof body !== 'object') return DEFAULT_ADVICE_MODEL
	const raw = (body as { model?: unknown }).model
	if (typeof raw !== 'string') return DEFAULT_ADVICE_MODEL
	if ((ADVICE_MODEL_IDS as readonly string[]).includes(raw)) {
		return raw as AdviceModelId
	}
	return DEFAULT_ADVICE_MODEL
}

function jsonResponse(
	body: Record<string, unknown>,
	init?: ResponseInit,
): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			...Object.fromEntries(new Headers(init?.headers).entries()),
		},
	})
}

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

function decodeCatalogEntryIdFromPath(raw: string | undefined): string | null {
	if (raw === undefined) return null
	try {
		return normalizeCatalogEntryIdParam(decodeURIComponent(raw))
	} catch {
		return normalizeCatalogEntryIdParam(raw)
	}
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

			const load = await loadCatalogPageContext(context)
			const { catalogSnapshot, entries, session, layoutSession } = load

			return renderCatalogPage({
				catalog: catalogSnapshot.entries,
				entries,
				session: layoutSession,
				pendingApproval: layoutSession?.approvalStatus === 'pending',
				canImport: catalogCanImport({
					session,
					layoutSession,
					ownerLogin: catalogSnapshot.ownerLogin,
				}),
				sharedCatalogOwnerLogin: catalogSnapshot.ownerLogin,
				typeFilter,
				query,
				flashError: context.get(Session).get('error') as string | undefined,
			})
		},

		async etf(context: AppRequestContext) {
			const entryId = decodeCatalogEntryIdFromPath(
				context.params.catalogEntryId,
			)
			if (entryId === null) {
				return new Response('Not found', {
					status: 404,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				})
			}

			const { catalogSnapshot, layoutSession } =
				await loadCatalogPageContext(context)
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

			return render({
				title: format(t('meta.title.catalogEtf'), { name: fundName }),
				session: layoutSession,
				currentPage: 'catalog',
				body: jsx(CatalogEtfPage, {
					entry,
					backHref,
					analysisPostHref: routes.catalog.etfAnalysis.href({
						catalogEntryId: entry.id,
					}),
					selectedModel: model,
				}),
				init: { headers: { 'Cache-Control': 'no-store' } },
			})
		},

		async etfAnalysis(context: AppRequestContext) {
			const entryId = decodeCatalogEntryIdFromPath(
				context.params.catalogEntryId,
			)
			if (entryId === null) {
				return jsonResponse(
					{ error: t('errors.catalog.etfDetail.notFound') },
					{
						status: 404,
					},
				)
			}

			const layoutSession = getLayoutSession(context.get(Session))
			if (layoutSession?.approvalStatus === 'pending') {
				return jsonResponse(
					{ error: t('errors.catalog.etfDetail.pendingAnalysis') },
					{ status: 403 },
				)
			}

			let jsonBody: unknown
			try {
				jsonBody = await context.request.json()
			} catch {
				jsonBody = null
			}
			const model = parseAdviceModelFromJsonBody(jsonBody)

			const catalogSnapshot = await fetchSharedCatalogSnapshot()
			const entry = catalogSnapshot.entries.find((row) => row.id === entryId)
			if (entry === undefined) {
				return jsonResponse(
					{ error: t('errors.catalog.etfDetail.notFound') },
					{
						status: 404,
					},
				)
			}

			try {
				const client = getOrCreateAdviceClient()
				const text = await getCatalogEtfDeepDiveText({
					entry,
					client,
					model,
				})
				return jsonResponse(
					{ text },
					{
						headers: { 'Cache-Control': 'no-store' },
					},
				)
			} catch (err) {
				console.error('[catalog] etf analysis POST failed', err)
				return jsonResponse(
					{ error: t('errors.catalog.etfDetail.service') },
					{ status: 503 },
				)
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
