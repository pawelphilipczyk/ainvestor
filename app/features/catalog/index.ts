import { jsx } from 'remix/component/jsx-runtime'
import { renderToStream } from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { requestAcceptsApplicationJson } from '../../lib/frame-submit-request.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { format, t } from '../../lib/i18n.ts'
import { MULTIPART_MAX_FILE_BYTES } from '../../lib/multipart-upload-limits.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import type { SessionData } from '../../lib/session.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import {
	type FlashBannerTone,
	type FlashedBanner,
	flashBanner,
	readFlashedBanner,
} from '../../lib/session-flash.ts'
import { htmlLangForCurrentUiLocale } from '../../lib/ui-locale.ts'
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
import {
	CatalogEtfModalBodyFragment,
	type CatalogEtfModalBodyFragmentProps,
} from './catalog-etf-modal-body-fragment.tsx'
import {
	catalogEtfAnalysisFrameSrc,
	parseOptionalAdviceModelFromUrl,
	samePathAndSearch,
} from './catalog-etf-overlay-build.ts'
import { getCatalogEtfDeepDiveText } from './catalog-etf-openai.ts'
import { CatalogEtfPage } from './catalog-etf-page.tsx'
import { CatalogListFragment } from './catalog-list-fragment.tsx'
import {
	isAdmin,
	loadCatalogEtfDetailContext,
	loadCatalogPageContext,
} from './catalog-load-context.ts'
import { CatalogPage } from './catalog-page.tsx'
import { extractBankApiJsonFromHar } from './har-bank-json-adapter.ts'
import type { CatalogEntry, CatalogRiskBand } from './lib.ts'
import {
	type BankJsonImportRowIssue,
	type BankJsonParseForImportResult,
	fetchSharedCatalogSnapshot,
	isSharedCatalogAdmin,
	mergeBankIntoCatalog,
	parseBankJsonForImport,
	parseCatalogRiskFilterParam,
	saveCatalog,
} from './lib.ts'

export { resetTestSessionCookieJar as resetGuestCatalog } from '../../lib/test-session-fetch.ts'

/** Cookie session storage (~4KB total); keep flash small so login + flash still fit. */
const MAX_IMPORT_FLASH_UTF16_UNITS = 2_400
const NOTE_ROW_DETAIL_LIMIT = 10

function truncateImportFlashForCookieSession(message: string): string {
	if (message.length <= MAX_IMPORT_FLASH_UTF16_UNITS) return message
	const suffix = t('errors.catalog.import.diagnostic.flashTruncated')
	const newlineAndSuffix = `\n${suffix}`
	const budget = MAX_IMPORT_FLASH_UTF16_UNITS - newlineAndSuffix.length
	if (budget <= 0) return suffix
	return `${message.slice(0, budget)}${newlineAndSuffix}`
}

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

function formatCatalogImportOutcomeFlash(params: {
	appliedCount: number
	parseResult: BankJsonParseForImportResult
}): string | null {
	const { appliedCount, parseResult } = params
	const { skippedRowDiagnostics, noteRowDiagnostics } = parseResult

	const lines: string[] = []
	if (appliedCount > 0) {
		lines.push(
			format(t('errors.catalog.import.diagnostic.savedLead'), {
				appliedCount,
			}),
		)
	} else {
		if (skippedRowDiagnostics.length === 0 && noteRowDiagnostics.length === 0) {
			return null
		}
		lines.push(t('errors.catalog.import.diagnostic.nothingSavedLead'))
	}

	if (skippedRowDiagnostics.length > 0) {
		lines.push('')
		lines.push(t('errors.catalog.import.diagnostic.skippedHeading'))
		for (const row of skippedRowDiagnostics) {
			lines.push(`Row ${row.index} (${row.label}):`)
			for (const issue of row.issues) {
				lines.push(`  • ${formatBankImportRowIssue(issue)}`)
			}
		}
	}

	if (noteRowDiagnostics.length > 0) {
		lines.push('')
		lines.push(t('errors.catalog.import.diagnostic.notesHeading'))
		if (noteRowDiagnostics.length <= NOTE_ROW_DETAIL_LIMIT) {
			for (const row of noteRowDiagnostics) {
				lines.push(`Row ${row.index} (${row.label}):`)
				for (const issue of row.issues) {
					lines.push(`  • ${formatBankImportRowIssue(issue)}`)
				}
			}
		} else {
			lines.push(
				`  • ${format(t('errors.catalog.import.diagnostic.notesSummaryMany'), {
					count: noteRowDiagnostics.length,
				})}`,
			)
		}
	}

	return truncateImportFlashForCookieSession(lines.join('\n'))
}

function catalogImportOutcomeTone(
	parseResult: BankJsonParseForImportResult,
): 'error' | 'info' | 'success' {
	if (
		parseResult.skippedRowDiagnostics.length > 0 ||
		parseResult.noteRowDiagnostics.length > 0
	) {
		return 'info'
	}
	return 'success'
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

const adminEtfImportRedirect = () =>
	createRedirectResponse(routes.admin.etfImport.href())

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

function renderCatalogEtfModalBodyFragmentHtml(
	props: CatalogEtfModalBodyFragmentProps,
	init?: ResponseInit,
): Response {
	const headers = new Headers(init?.headers)
	headers.set('Cache-Control', 'no-store')
	return createHtmlResponse(
		renderToStream(jsx(CatalogEtfModalBodyFragment, props)),
		{
			...init,
			headers,
		},
	)
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const catalogController = {
	actions: {
		async index(context: AppRequestContext) {
			const url = new URL(context.request.url)
			const typeFilter = url.searchParams.get('type') ?? ''
			const riskFilter = parseCatalogRiskFilterParam(
				url.searchParams.get('risk'),
			)
			const query = url.searchParams.get('q') ?? ''

			const load = await loadCatalogPageContext(context)
			const { catalogSnapshot, entries, session, layoutSession } = load

			return renderCatalogPage({
				requestUrl: context.request.url,
				catalog: catalogSnapshot.entries,
				entries,
				session: layoutSession,
				isAdmin: isAdmin({
					session,
					layoutSession,
					ownerLogin: catalogSnapshot.ownerLogin,
				}),
				pendingApproval: layoutSession?.approvalStatus === 'pending',
				typeFilter,
				riskFilter,
				query,
				flashBanner: readFlashedBanner(context.get(Session)),
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
					htmlLang: htmlLangForCurrentUiLocale(),
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
				htmlLang: htmlLangForCurrentUiLocale(),
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

		async fragmentEtfModalBody(context: AppRequestContext) {
			const entryId = decodeCatalogEntryIdFromPath(
				(context.params as Record<string, string>).catalogEntryId,
			)
			if (entryId === null) {
				return new Response('Not found', {
					status: 404,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				})
			}

			const url = new URL(context.request.url)
			const rawClose = url.searchParams.get('close')
			if (rawClose === null || rawClose.trim().length === 0) {
				return new Response('Bad request', {
					status: 400,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				})
			}
			let catalogFallbackHref: string
			try {
				catalogFallbackHref = decodeURIComponent(rawClose.trim())
			} catch {
				return new Response('Bad request', {
					status: 400,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				})
			}

			const layoutSession = getLayoutSession(context.get(Session))
			const pendingApproval = layoutSession?.approvalStatus === 'pending'
			const model = parseOptionalAdviceModelFromUrl(context.request.url)

			const catalogSnapshot = await fetchSharedCatalogSnapshot()
			const entry = catalogSnapshot.entries.find((row) => row.id === entryId)
			if (entry === undefined) {
				return new Response('Not found', {
					status: 404,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				})
			}

			if (pendingApproval) {
				return renderCatalogEtfModalBodyFragmentHtml({
					entry,
					catalogFallbackHref,
					descriptionText: t('catalog.etfDetail.pendingBody'),
				})
			}

			const analysisFrameSrc = catalogEtfAnalysisFrameSrc(entry.id, model)
			return renderCatalogEtfModalBodyFragmentHtml({
				entry,
				catalogFallbackHref,
				analysisPostHref: routes.catalog.etfAnalysis.href({
					catalogEntryId: entry.id,
				}),
				analysisFrameSrc,
				selectedModel: model,
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
			const session = context.get(Session)
			const wantsFrameSubmitJson = requestAcceptsApplicationJson(
				context.request,
			)

			function importFailureResponse(
				text: string,
				tone: FlashBannerTone = 'error',
			): Response {
				if (wantsFrameSubmitJson) {
					return new Response(JSON.stringify({ error: text }), {
						status: 422,
						headers: { 'Content-Type': 'application/json' },
					})
				}
				flashBanner(session, { text, tone })
				return adminEtfImportRedirect()
			}

			const sessionData = getSessionData(session)
			if (!sessionData?.token || !sessionData?.login) {
				return importFailureResponse(t('errors.catalog.importNotAllowed'))
			}
			const { ownerLogin, entries } = await fetchSharedCatalogSnapshot()
			const canImport = isSharedCatalogAdmin({
				sessionLogin: sessionData.login,
				ownerLogin,
			})
			if (!canImport) {
				return importFailureResponse(t('errors.catalog.importNotAllowed'))
			}

			const form = context.get(FormData)
			const harUpload = form?.get('bankApiHar')

			let parsedJson: unknown

			if (harUpload instanceof File && harUpload.size > 0) {
				if (harUpload.size > MULTIPART_MAX_FILE_BYTES) {
					return importFailureResponse(t('errors.upload.fileTooLarge'))
				}
				let harRoot: unknown
				try {
					harRoot = JSON.parse(await harUpload.text())
				} catch {
					return importFailureResponse(t('errors.catalog.import.invalidHar'))
				}
				const extracted = extractBankApiJsonFromHar(harRoot)
				if (!extracted.ok) {
					return importFailureResponse(t('errors.catalog.import.invalidHar'))
				}
				parsedJson = extracted.payload
			} else {
				const rawFromForm = form?.get('bankApiJson')
				if (typeof rawFromForm !== 'string') {
					return importFailureResponse(t('errors.catalog.import.fieldMissing'))
				}
				const trimmedJson = rawFromForm.trim()
				if (trimmedJson.length === 0) {
					return importFailureResponse(t('errors.catalog.import.emptyJson'))
				}
				try {
					parsedJson = JSON.parse(trimmedJson)
				} catch {
					return importFailureResponse(t('errors.catalog.import.invalidJson'))
				}
			}

			const parseResult = parseBankJsonForImport(parsedJson, entries)
			if (parseResult.structuralIssue === 'notObject') {
				return importFailureResponse(
					t('errors.catalog.import.issue.expectedObject'),
				)
			}
			if (parseResult.structuralIssue === 'dataNotArray') {
				return importFailureResponse(
					t('errors.catalog.import.issue.dataNotArray'),
				)
			}
			if (
				parseResult.expectedDataRows === 0 &&
				parseResult.skippedRowDiagnostics.length === 0
			) {
				return importFailureResponse(t('errors.catalog.import.dataArrayEmpty'))
			}

			const imported = parseResult.entries
			if (imported.length === 0) {
				const detailedFlash = formatCatalogImportOutcomeFlash({
					appliedCount: 0,
					parseResult,
				})
				return importFailureResponse(
					detailedFlash ?? t('errors.catalog.import.noRowsParsed'),
				)
			}

			const merged = mergeBankIntoCatalog(entries, imported)
			try {
				await saveCatalog({ token: sessionData.token, entries: merged })
			} catch (error) {
				console.error('[catalog] import save failed', error)
				return importFailureResponse(t('errors.catalog.import.saveFailed'))
			}

			const outcomeFlash = formatCatalogImportOutcomeFlash({
				appliedCount: imported.length,
				parseResult,
			})
			const successText =
				outcomeFlash ??
				format(t('errors.catalog.import.diagnostic.savedLead'), {
					appliedCount: imported.length,
				})
			const successTone = catalogImportOutcomeTone(parseResult)

			if (wantsFrameSubmitJson) {
				return new Response(
					JSON.stringify({
						ok: true,
						bannerText: successText,
						bannerTone: successTone,
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					},
				)
			}

			flashBanner(session, {
				text: successText,
				tone: successTone,
			})

			return adminEtfImportRedirect()
		},

		async fragmentList(context: AppRequestContext) {
			const url = new URL(context.request.url)
			const typeFilter = url.searchParams.get('type') ?? ''
			const riskFilter = parseCatalogRiskFilterParam(
				url.searchParams.get('risk'),
			)
			const query = url.searchParams.get('q') ?? ''

			const load = await loadCatalogPageContext(context)
			const { catalogSnapshot, entries, session, layoutSession } = load
			const pendingApproval = layoutSession?.approvalStatus === 'pending'

			return createHtmlResponse(
				renderToStream(
					jsx(CatalogListFragment, {
						catalog: catalogSnapshot.entries,
						holdings: entries,
						typeFilter,
						riskFilter,
						query,
						totalCatalogCount: catalogSnapshot.entries.length,
						isAdmin: isAdmin({
							session,
							layoutSession,
							ownerLogin: catalogSnapshot.ownerLogin,
						}),
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
	riskFilter: '' | CatalogRiskBand
	query: string
}): string {
	const searchParams = new URLSearchParams()
	if (params.typeFilter) searchParams.set('type', params.typeFilter)
	if (params.riskFilter) searchParams.set('risk', params.riskFilter)
	if (params.query) searchParams.set('q', params.query)
	const qs = searchParams.toString()
	const base = routes.catalog.fragmentList.href()
	return qs ? `${base}?${qs}` : base
}

async function renderCatalogPage(params: {
	requestUrl: string
	catalog: CatalogEntry[]
	entries: EtfEntry[]
	session: SessionData | null
	isAdmin: boolean
	pendingApproval?: boolean
	typeFilter: string
	riskFilter: '' | CatalogRiskBand
	query: string
	flashBanner?: FlashedBanner
}) {
	const {
		requestUrl,
		catalog,
		entries,
		session,
		isAdmin,
		pendingApproval,
		typeFilter,
		riskFilter,
		query,
		flashBanner,
	} = params
	const frameSrc = catalogListFrameSrc({ typeFilter, riskFilter, query })
	const body = jsx(CatalogPage, {
		catalogCount: catalog.length,
		typeFilter,
		riskFilter,
		query,
		catalogListFrameSrc: frameSrc,
	})
	return render({
		title: t('meta.title.catalog'),
		htmlLang: htmlLangForCurrentUiLocale(),
		session,
		currentPage: 'catalog',
		body,
		flashBanner,
		requestUrl,
		resolveFrame(source) {
			if (source === frameSrc) {
				return renderToStream(
					jsx(CatalogListFragment, {
						catalog,
						holdings: entries,
						typeFilter,
						riskFilter,
						query,
						totalCatalogCount: catalog.length,
						isAdmin,
						pendingApproval,
					}),
				)
			}
			return ''
		},
	})
}
