import { jsx } from 'remix/component/jsx-runtime'
import { renderToStream } from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
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
import {
	CatalogEtfAnalysisFragment,
	type CatalogEtfAnalysisFragmentProps,
} from './catalog-etf-analysis-fragment.tsx'
import { getCatalogEtfDeepDiveText } from './catalog-etf-openai.ts'
import { CatalogEtfPage } from './catalog-etf-page.tsx'
import { CatalogListFragment } from './catalog-list-fragment.tsx'
import {
	catalogCanImport,
	loadCatalogEtfDetailContext,
	loadCatalogPageContext,
} from './catalog-load-context.ts'
import { CatalogPage } from './catalog-page.tsx'
import type { CatalogEntry } from './lib.ts'
import {
	type BankJsonImportRowIssue,
	type BankJsonParseForImportResult,
	fetchSharedCatalogSnapshot,
	isSharedCatalogAdmin,
	mergeBankIntoCatalog,
	parseBankJsonForImport,
	saveCatalog,
} from './lib.ts'

export { resetTestSessionCookieJar as resetGuestCatalog } from '../../lib/test-session-fetch.ts'

function formatBankImportRowIssue(issue: BankJsonImportRowIssue): string {
	switch (issue.kind) {
		case 'rowNotObject':
			return t('errors.catalog.import.issue.rowNotObject')
		case 'missingTicker':
			return t('errors.catalog.import.issue.missingTicker')
		case 'missingFundName':
			return t('errors.catalog.import.issue.missingFundName')
		case 'isinInvalid':
			return t('errors.catalog.import.issue.isinInvalid')
		case 'duplicateIdInPaste':
			return format(t('errors.catalog.import.issue.duplicateIdInPaste'), {
				id: issue.id,
				otherIndex: issue.otherIndex,
			})
		case 'duplicateMergeKeyInPaste':
			return format(t('errors.catalog.import.issue.duplicateMergeKeyInPaste'), {
				otherIndex: issue.otherIndex,
			})
		case 'alreadyInCatalog':
			return t('errors.catalog.import.issue.alreadyInCatalog')
		case 'idAlreadyInCatalog':
			return format(t('errors.catalog.import.issue.idAlreadyInCatalog'), {
				id: issue.id,
			})
		default: {
			const exhaustive: never = issue
			return String(exhaustive)
		}
	}
}

function formatBankImportDiagnostics(
	parseResult: BankJsonParseForImportResult,
): string | null {
	if (parseResult.rowDiagnostics.length === 0) return null
	const issueCount = parseResult.rowDiagnostics.reduce(
		(sum, row) => sum + row.issues.length,
		0,
	)
	const lines: string[] = [
		format(t('errors.catalog.import.diagnostic.lead'), {
			issueCount,
			dataRowCount: parseResult.expectedDataRows,
		}),
	]
	for (const row of parseResult.rowDiagnostics) {
		lines.push(`Row ${row.index} (${row.label}):`)
		for (const issue of row.issues) {
			lines.push(`  • ${formatBankImportRowIssue(issue)}`)
		}
	}
	return lines.join('\n')
}

function parseAdviceModelFromJsonBody(body: unknown): AdviceModelId {
	if (body === null || typeof body !== 'object') return DEFAULT_ADVICE_MODEL
	const raw = (body as { model?: unknown }).model
	if (typeof raw !== 'string') return DEFAULT_ADVICE_MODEL
	if ((ADVICE_MODEL_IDS as readonly string[]).includes(raw)) {
		return raw as AdviceModelId
	}
	return DEFAULT_ADVICE_MODEL
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

function parseOptionalAdviceModelFromUrl(url: string): AdviceModelId {
	const raw = new URL(url).searchParams.get('model')
	if (raw && (ADVICE_MODEL_IDS as readonly string[]).includes(raw)) {
		return raw as AdviceModelId
	}
	return DEFAULT_ADVICE_MODEL
}

function catalogEtfAnalysisFrameSrc(
	entryId: string,
	model: AdviceModelId,
): string {
	const base = routes.catalog.fragmentEtfAnalysis.href({
		catalogEntryId: entryId,
	})
	if (model === DEFAULT_ADVICE_MODEL) return base
	const searchParams = new URLSearchParams({ model })
	return `${base}?${searchParams.toString()}`
}

function renderCatalogEtfAnalysisFragmentHtml(
	props: CatalogEtfAnalysisFragmentProps,
	init?: ResponseInit,
): Response {
	const headers = new Headers(init?.headers)
	headers.set('Cache-Control', 'no-store')
	return createHtmlResponse(
		renderToStream(jsx(CatalogEtfAnalysisFragment, props)),
		{
			...init,
			headers,
		},
	)
}

function samePathAndSearch(a: string, b: string): boolean {
	try {
		const urlA = new URL(a, 'https://frame-resolve.local')
		const urlB = new URL(b, 'https://frame-resolve.local')
		return urlA.pathname === urlB.pathname && urlA.search === urlB.search
	} catch {
		return a === b
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
				(context.params as Record<string, string>).catalogEntryId,
			)
			if (entryId === null) {
				return new Response('Not found', {
					status: 404,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				})
			}

			const { catalogSnapshot, layoutSession } =
				await loadCatalogEtfDetailContext(context)
			const pendingApproval = layoutSession?.approvalStatus === 'pending'
			const catalogFallbackHref = routes.catalog.index.href()
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
						catalogFallbackHref,
					}),
					init: { headers: { 'Cache-Control': 'no-store' } },
				})
			}

			const model = parseOptionalAdviceModelFromUrl(context.request.url)
			const analysisFrameSrc = catalogEtfAnalysisFrameSrc(entry.id, model)

			return render({
				title: format(t('meta.title.catalogEtf'), { name: fundName }),
				session: layoutSession,
				currentPage: 'catalog',
				body: jsx(CatalogEtfPage, {
					entry,
					catalogFallbackHref,
					analysisPostHref: routes.catalog.etfAnalysis.href({
						catalogEntryId: entry.id,
					}),
					analysisFrameSrc,
					selectedModel: model,
				}),
				init: { headers: { 'Cache-Control': 'no-store' } },
				resolveFrame(source) {
					if (samePathAndSearch(source, analysisFrameSrc)) {
						return renderToStream(jsx(CatalogEtfAnalysisFragment, {}))
					}
					return ''
				},
			})
		},

		async etfAnalysis(context: AppRequestContext) {
			const entryId = decodeCatalogEntryIdFromPath(
				(context.params as Record<string, string>).catalogEntryId,
			)
			if (entryId === null) {
				return renderCatalogEtfAnalysisFragmentHtml(
					{ error: t('errors.catalog.etfDetail.notFound') },
					{ status: 404 },
				)
			}

			const layoutSession = getLayoutSession(context.get(Session))
			if (layoutSession?.approvalStatus === 'pending') {
				return renderCatalogEtfAnalysisFragmentHtml(
					{ error: t('errors.catalog.etfDetail.pendingAnalysis') },
					{ status: 403 },
				)
			}

			const contentType = context.request.headers.get('content-type') ?? ''
			let model: AdviceModelId = DEFAULT_ADVICE_MODEL
			if (contentType.includes('application/json')) {
				let jsonBody: unknown
				try {
					jsonBody = await context.request.json()
				} catch {
					jsonBody = null
				}
				model = parseAdviceModelFromJsonBody(jsonBody)
			} else {
				const form = context.get(FormData)
				const rawModel = form?.get('model')
				if (
					typeof rawModel === 'string' &&
					(ADVICE_MODEL_IDS as readonly string[]).includes(rawModel)
				) {
					model = rawModel as AdviceModelId
				}
			}

			const catalogSnapshot = await fetchSharedCatalogSnapshot()
			const entry = catalogSnapshot.entries.find((row) => row.id === entryId)
			if (entry === undefined) {
				return renderCatalogEtfAnalysisFragmentHtml(
					{ error: t('errors.catalog.etfDetail.notFound') },
					{ status: 404 },
				)
			}

			try {
				const client = getOrCreateAdviceClient()
				const text = await getCatalogEtfDeepDiveText({
					entry,
					client,
					model,
				})
				return renderCatalogEtfAnalysisFragmentHtml({ text })
			} catch (err) {
				console.error('[catalog] etf analysis POST failed', err)
				return renderCatalogEtfAnalysisFragmentHtml(
					{ error: t('errors.catalog.etfDetail.service') },
					{ status: 503 },
				)
			}
		},

		async fragmentEtfAnalysis(context: AppRequestContext) {
			const entryId = decodeCatalogEntryIdFromPath(
				(context.params as Record<string, string>).catalogEntryId,
			)
			if (entryId === null) {
				return renderCatalogEtfAnalysisFragmentHtml(
					{ error: t('errors.catalog.etfDetail.notFound') },
					{ status: 404 },
				)
			}

			const layoutSession = getLayoutSession(context.get(Session))
			if (layoutSession?.approvalStatus === 'pending') {
				return renderCatalogEtfAnalysisFragmentHtml(
					{ error: t('errors.catalog.etfDetail.pendingAnalysis') },
					{ status: 403 },
				)
			}

			const catalogSnapshot = await fetchSharedCatalogSnapshot()
			if (!catalogSnapshot.entries.some((row) => row.id === entryId)) {
				return renderCatalogEtfAnalysisFragmentHtml(
					{ error: t('errors.catalog.etfDetail.notFound') },
					{ status: 404 },
				)
			}

			return createHtmlResponse(
				renderToStream(jsx(CatalogEtfAnalysisFragment, {})),
				{ headers: { 'Cache-Control': 'no-store' } },
			)
		},

		async import(context: AppRequestContext) {
			const sessionStore = context.get(Session)
			const sessionData = getSessionData(sessionStore)
			if (!sessionData?.token || !sessionData?.login) {
				sessionStore.flash('error', t('errors.catalog.importNotAllowed'))
				return catalogIndexRedirect()
			}
			const { ownerLogin, entries } = await fetchSharedCatalogSnapshot()
			const canImport = isSharedCatalogAdmin({
				sessionLogin: sessionData.login,
				ownerLogin,
			})
			if (!canImport) {
				sessionStore.flash('error', t('errors.catalog.importNotAllowed'))
				return catalogIndexRedirect()
			}

			const rawFromForm = context.get(FormData)?.get('bankApiJson')
			if (typeof rawFromForm !== 'string') {
				sessionStore.flash('error', t('errors.catalog.import.fieldMissing'))
				return catalogIndexRedirect()
			}
			const trimmedJson = rawFromForm.trim()
			if (trimmedJson.length === 0) {
				sessionStore.flash('error', t('errors.catalog.import.emptyJson'))
				return catalogIndexRedirect()
			}
			let parsedJson: unknown
			try {
				parsedJson = JSON.parse(trimmedJson)
			} catch {
				sessionStore.flash('error', t('errors.catalog.import.invalidJson'))
				return catalogIndexRedirect()
			}

			const parseResult = parseBankJsonForImport(parsedJson, entries)
			if (parseResult.structuralIssue === 'notObject') {
				sessionStore.flash(
					'error',
					t('errors.catalog.import.issue.expectedObject'),
				)
				return catalogIndexRedirect()
			}
			if (parseResult.structuralIssue === 'dataNotArray') {
				sessionStore.flash(
					'error',
					t('errors.catalog.import.issue.dataNotArray'),
				)
				return catalogIndexRedirect()
			}
			if (
				parseResult.expectedDataRows === 0 &&
				parseResult.rowDiagnostics.length === 0
			) {
				sessionStore.flash('error', t('errors.catalog.import.dataArrayEmpty'))
				return catalogIndexRedirect()
			}

			const diagnosticMessage = formatBankImportDiagnostics(parseResult)
			if (diagnosticMessage) {
				sessionStore.flash('error', diagnosticMessage)
				return catalogIndexRedirect()
			}

			const imported = parseResult.entries
			if (imported.length === 0) {
				sessionStore.flash('error', t('errors.catalog.import.noRowsParsed'))
				return catalogIndexRedirect()
			}

			const merged = mergeBankIntoCatalog(entries, imported)
			try {
				await saveCatalog({ token: sessionData.token, entries: merged })
			} catch (error) {
				console.error('[catalog] import save failed', error)
				sessionStore.flash('error', t('errors.catalog.import.saveFailed'))
				return catalogIndexRedirect()
			}

			return createRedirectResponse(routes.catalog.index.href())
		},

		async fragmentList(context: AppRequestContext) {
			const url = new URL(context.request.url)
			const typeFilter = url.searchParams.get('type') ?? ''
			const query = url.searchParams.get('q') ?? ''

			const load = await loadCatalogPageContext(context)
			const { catalogSnapshot, entries } = load
			const layoutSession = getLayoutSession(context.get(Session))
			const pendingApproval = layoutSession?.approvalStatus === 'pending'

			return createHtmlResponse(
				renderToStream(
					jsx(CatalogListFragment, {
						catalog: catalogSnapshot.entries,
						holdings: entries,
						typeFilter,
						query,
						totalCatalogCount: catalogSnapshot.entries.length,
						pendingApproval,
					}),
				),
				{ headers: { 'Cache-Control': 'no-store' } },
			)
		},
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
function catalogListFrameSrc(params: {
	typeFilter: string
	query: string
}): string {
	const searchParams = new URLSearchParams()
	if (params.typeFilter) searchParams.set('type', params.typeFilter)
	if (params.query) searchParams.set('q', params.query)
	const qs = searchParams.toString()
	const base = routes.catalog.fragmentList.href()
	return qs ? `${base}?${qs}` : base
}

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
	const frameSrc = catalogListFrameSrc({ typeFilter, query })
	const body = jsx(CatalogPage, {
		catalogCount: catalog.length,
		canImport,
		typeFilter,
		query,
		sharedCatalogOwnerLogin,
		catalogListFrameSrc: frameSrc,
	})
	return render({
		title: t('meta.title.catalog'),
		session,
		currentPage: 'catalog',
		body,
		flashError,
		resolveFrame(source) {
			if (source === frameSrc) {
				return renderToStream(
					jsx(CatalogListFragment, {
						catalog,
						holdings: entries,
						typeFilter,
						query,
						totalCatalogCount: catalog.length,
						pendingApproval,
					}),
				)
			}
			return ''
		},
	})
}
