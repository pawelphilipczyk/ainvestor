import type { StandardSchemaV1 } from '@standard-schema/spec'
import { object, optional, parseSafe, string } from 'remix/data-schema'
import { max, min } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToStream } from 'remix/ui/server'
import { render } from '../../components/render.ts'
import { objectFromFormData } from '../../lib/form-data-payload.ts'
import {
	requestAcceptsApplicationJson,
	requestAcceptsFrameSubmitHtml,
} from '../../lib/frame-submit-request.ts'
import {
	getGuestGuidelines,
	setGuestGuidelines,
} from '../../lib/guest-session-state.ts'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import {
	fetchGuidelines,
	findGuidelineDuplicateOf,
	formatEtfTypeLabel,
	formatGuidelineTargetPercentForInput,
	isEtfType,
	saveGuidelines,
	sumGuidelineTargetPercent,
	wouldGuidelineTotalExceedCap,
} from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'
import { parseLocaleDecimalString } from '../../lib/locale-decimal-input.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import type { SessionData } from '../../lib/session.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import {
	type FlashedBanner,
	flashBanner,
	readFlashedBanner,
} from '../../lib/session-flash.ts'
import { htmlLangForCurrentUiLocale } from '../../lib/ui-locale.ts'
import { routes } from '../../routes.ts'
import type { CatalogEntry } from '../catalog/lib.ts'
import {
	assetClassSelectOptionsFromCatalog,
	fetchCatalog,
	findCatalogEntryByTicker,
	instrumentSelectOptionsFromCatalog,
} from '../catalog/lib.ts'
import { GuidelinesListFragment } from './guidelines-list-fragment.tsx'
import { GuidelinesPage } from './guidelines-page.tsx'

type GuidelinesAddTabId = 'instrument' | 'bucket'

function normalizeGuidelinesAddTab(tab: string | null): GuidelinesAddTabId {
	if (tab === 'instrument') return 'instrument'
	return 'bucket'
}

function guidelinesIndexHref(tab?: GuidelinesAddTabId) {
	if (tab === 'instrument') {
		return routes.guidelines.index.href({}, { tab: 'instrument' })
	}
	return routes.guidelines.index.href()
}

const InstrumentGuidelineSchema = object({
	instrumentTicker: optional(string()),
	targetPct: coerce.number().pipe(min(0.001), max(100)),
})

const AssetClassGuidelineSchema = object({
	assetClassType: optional(string()),
	targetPct: coerce.number().pipe(min(0.001), max(100)),
})

const UpdateGuidelineTargetSchema = object({
	targetPct: coerce.number().pipe(min(0.001), max(100)),
})

/** Same locale rules as other decimal form fields (HTML `pattern` + {@link parseLocaleDecimalString}). */
function normalizeGuidelineTargetPctInput(raw: Record<string, unknown>): void {
	if (typeof raw.targetPct === 'string') {
		const parsed = parseLocaleDecimalString(raw.targetPct)
		raw.targetPct = parsed === null ? raw.targetPct : String(parsed)
	}
}

async function loadGuidelinesForSession(
	context: AppRequestContext,
): Promise<EtfGuideline[]> {
	const session = getSessionData(context.get(Session))
	if (session?.gistId && session.token) {
		return fetchGuidelines(session.token, session.gistId)
	}
	return getGuestGuidelines(context.get(Session))
}

async function guidelinesListFragmentHtmlResponse(params: {
	guidelines: EtfGuideline[]
	inlineError?: string
	status?: number
}) {
	return createHtmlResponse(
		renderToStream(
			jsx(GuidelinesListFragment, {
				guidelines: params.guidelines,
				...(params.inlineError !== undefined && params.inlineError.length > 0
					? { inlineError: params.inlineError }
					: {}),
			}),
		),
		{
			status: params.status ?? 200,
			headers: { 'Cache-Control': 'no-store' },
		},
	)
}

async function guidelinesTotalCapErrorResponse(params: {
	context: AppRequestContext
	request: Request
	session: Session
	currentTotal: number
	addedPercent: number
	addTab: GuidelinesAddTabId
}): Promise<Response> {
	const message = format(t('errors.guidelines.totalExceeds100'), {
		current: formatGuidelineTargetPercentForInput(params.currentTotal),
		added: formatGuidelineTargetPercentForInput(params.addedPercent),
	})
	if (requestAcceptsApplicationJson(params.request)) {
		return new Response(JSON.stringify({ error: message }), {
			status: 422,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	if (requestAcceptsFrameSubmitHtml(params.request)) {
		const guidelines = await loadGuidelinesForSession(params.context)
		return guidelinesListFragmentHtmlResponse({
			guidelines,
			inlineError: message,
			status: 422,
		})
	}
	flashBanner(params.session, { text: message, tone: 'error' })
	return createRedirectResponse(guidelinesIndexHref(params.addTab))
}

async function guidelinesDuplicateErrorResponse(params: {
	context: AppRequestContext
	request: Request
	session: Session
	entry: EtfGuideline
	addTab: GuidelinesAddTabId
}): Promise<Response> {
	const message =
		params.entry.kind === 'instrument'
			? format(t('errors.guidelines.duplicateInstrument'), {
					ticker: params.entry.etfName.trim().toUpperCase(),
				})
			: format(t('errors.guidelines.duplicateAssetClass'), {
					label: formatEtfTypeLabel(params.entry.etfType),
				})
	if (requestAcceptsApplicationJson(params.request)) {
		return new Response(JSON.stringify({ error: message }), {
			status: 422,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	if (requestAcceptsFrameSubmitHtml(params.request)) {
		const guidelines = await loadGuidelinesForSession(params.context)
		return guidelinesListFragmentHtmlResponse({
			guidelines,
			inlineError: message,
			status: 422,
		})
	}
	flashBanner(params.session, { text: message, tone: 'error' })
	return createRedirectResponse(guidelinesIndexHref(params.addTab))
}

function pathSegmentKey(
	segment: PropertyKey | StandardSchemaV1.PathSegment,
): string {
	if (typeof segment === 'object' && segment !== null && 'key' in segment) {
		return String(segment.key)
	}
	return String(segment)
}

function formatGuidelineTargetSchemaIssues(
	issues: ReadonlyArray<StandardSchemaV1.Issue>,
): { error: string; details: { path: string; message: string }[] } {
	const details = issues.map((issue) => ({
		path: issue.path?.length ? issue.path.map(pathSegmentKey).join('.') : '',
		message: issue.message,
	}))
	const fromIssues = details
		.map((d) => d.message)
		.filter(Boolean)
		.join(' ')
	const error =
		fromIssues.length > 0 ? fromIssues : t('errors.guidelines.targetPctInvalid')
	return { error, details }
}

async function guidelinesUpdateSchemaValidationResponse(params: {
	context: AppRequestContext
	request: Request
	session: Session
	issues: ReadonlyArray<StandardSchemaV1.Issue>
}): Promise<Response> {
	const { error, details } = formatGuidelineTargetSchemaIssues(params.issues)
	if (requestAcceptsApplicationJson(params.request)) {
		return new Response(JSON.stringify({ error, issues: details }), {
			status: 422,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	if (requestAcceptsFrameSubmitHtml(params.request)) {
		const guidelines = await loadGuidelinesForSession(params.context)
		return guidelinesListFragmentHtmlResponse({
			guidelines,
			inlineError: error,
			status: 422,
		})
	}
	flashBanner(params.session, { text: error, tone: 'error' })
	return createRedirectResponse(guidelinesIndexHref())
}

async function guidelinesUpdateCapErrorResponse(params: {
	context: AppRequestContext
	request: Request
	session: Session
	newTargetPercent: number
	resultingTotal: number
}): Promise<Response> {
	const message = format(t('errors.guidelines.updateTotalExceeds100'), {
		newTargetPercent: formatGuidelineTargetPercentForInput(
			params.newTargetPercent,
		),
		total: formatGuidelineTargetPercentForInput(params.resultingTotal),
	})
	if (requestAcceptsApplicationJson(params.request)) {
		return new Response(JSON.stringify({ error: message }), {
			status: 422,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	if (requestAcceptsFrameSubmitHtml(params.request)) {
		const guidelines = await loadGuidelinesForSession(params.context)
		return guidelinesListFragmentHtmlResponse({
			guidelines,
			inlineError: message,
			status: 422,
		})
	}
	flashBanner(params.session, { text: message, tone: 'error' })
	return createRedirectResponse(guidelinesIndexHref())
}

/**
 * Persists a new guideline using the same fresh `current` snapshot for cap check and write
 * (avoids a race where validation used a stale list while save refetched).
 * Returns an error response when the cap would be exceeded; otherwise null on success.
 */
async function persistGuideline(params: {
	entry: EtfGuideline
	session: SessionData | null
	remixSession: Session
	request: Request
	context: AppRequestContext
	addTab: GuidelinesAddTabId
}): Promise<Response | null> {
	const { entry, session, remixSession, request, context, addTab } = params
	if (session?.gistId && session.token) {
		const current = await fetchGuidelines(session.token, session.gistId)
		if (findGuidelineDuplicateOf(current, entry)) {
			return guidelinesDuplicateErrorResponse({
				context,
				request,
				session: remixSession,
				entry,
				addTab,
			})
		}
		if (
			wouldGuidelineTotalExceedCap({
				existing: current,
				additionalPercent: entry.targetPct,
			})
		) {
			return guidelinesTotalCapErrorResponse({
				context,
				request,
				session: remixSession,
				currentTotal: sumGuidelineTargetPercent(current),
				addedPercent: entry.targetPct,
				addTab,
			})
		}
		await saveGuidelines(session.token, session.gistId, [entry, ...current])
		return null
	}

	const current = getGuestGuidelines(remixSession)
	if (findGuidelineDuplicateOf(current, entry)) {
		return guidelinesDuplicateErrorResponse({
			context,
			request,
			session: remixSession,
			entry,
			addTab,
		})
	}
	if (
		wouldGuidelineTotalExceedCap({
			existing: current,
			additionalPercent: entry.targetPct,
		})
	) {
		return guidelinesTotalCapErrorResponse({
			context,
			request,
			session: remixSession,
			currentTotal: sumGuidelineTargetPercent(current),
			addedPercent: entry.targetPct,
			addTab,
		})
	}
	setGuestGuidelines(remixSession, [entry, ...current])
	return null
}

/**
 * Updates one guideline's `targetPct` after cap check. Returns null on success,
 * or a Response on failure (missing row redirect, cap 422/flash, etc.).
 */
async function updateGuidelineTarget(params: {
	id: string
	newTargetPercent: number
	session: SessionData | null
	remixSession: Session
	request: Request
	context: AppRequestContext
}): Promise<Response | null> {
	const { id, newTargetPercent, session, remixSession, request, context } =
		params

	if (session?.gistId && session.token) {
		const current = await fetchGuidelines(session.token, session.gistId)
		const existing = current.find((g) => g.id === id)
		if (!existing) {
			return createRedirectResponse(routes.guidelines.index.href())
		}
		const others = current.filter((g) => g.id !== id)
		const resultingTotal = sumGuidelineTargetPercent(others) + newTargetPercent
		if (
			wouldGuidelineTotalExceedCap({
				existing: others,
				additionalPercent: newTargetPercent,
			})
		) {
			return guidelinesUpdateCapErrorResponse({
				context,
				request,
				session: remixSession,
				newTargetPercent,
				resultingTotal,
			})
		}
		await saveGuidelines(
			session.token,
			session.gistId,
			current.map((g) =>
				g.id === id ? { ...g, targetPct: newTargetPercent } : g,
			),
		)
		return null
	}

	const current = getGuestGuidelines(remixSession)
	const existing = current.find((g) => g.id === id)
	if (!existing) {
		return createRedirectResponse(routes.guidelines.index.href())
	}
	const others = current.filter((g) => g.id !== id)
	const resultingTotal = sumGuidelineTargetPercent(others) + newTargetPercent
	if (
		wouldGuidelineTotalExceedCap({
			existing: others,
			additionalPercent: newTargetPercent,
		})
	) {
		return guidelinesUpdateCapErrorResponse({
			context,
			request,
			session: remixSession,
			newTargetPercent,
			resultingTotal,
		})
	}
	setGuestGuidelines(
		remixSession,
		current.map((g) =>
			g.id === id ? { ...g, targetPct: newTargetPercent } : g,
		),
	)
	return null
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const guidelinesController = {
	actions: {
		async index(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			const layoutSession = getLayoutSession(context.get(Session))
			const flashBanner = readFlashedBanner(context.get(Session))
			const activeAddTab = normalizeGuidelinesAddTab(
				new URL(context.request.url).searchParams.get('tab'),
			)
			const [guidelines, catalog] = await Promise.all([
				session?.gistId && session.token
					? fetchGuidelines(session.token, session.gistId)
					: getGuestGuidelines(context.get(Session)),
				fetchCatalog(),
			])
			return renderGuidelinesPage({
				guidelines,
				session: layoutSession,
				catalog,
				flashBanner,
				activeAddTab,
			})
		},

		async instrument(context: AppRequestContext) {
			const form = context.get(FormData)
			if (!form) {
				if (requestAcceptsFrameSubmitHtml(context.request)) {
					const guidelines = await loadGuidelinesForSession(context)
					return guidelinesListFragmentHtmlResponse({
						guidelines,
						inlineError: t('errors.guidelines.addFormInvalid'),
						status: 422,
					})
				}
				return createRedirectResponse(guidelinesIndexHref('instrument'))
			}

			const formPayload = objectFromFormData(form)
			normalizeGuidelineTargetPctInput(formPayload)
			const result = parseSafe(InstrumentGuidelineSchema, formPayload)
			if (!result.success) {
				if (requestAcceptsFrameSubmitHtml(context.request)) {
					const guidelines = await loadGuidelinesForSession(context)
					return guidelinesListFragmentHtmlResponse({
						guidelines,
						inlineError: t('errors.guidelines.addFormInvalid'),
						status: 422,
					})
				}
				return createRedirectResponse(guidelinesIndexHref('instrument'))
			}

			const session = getSessionData(context.get(Session))
			const catalog = await fetchCatalog()

			const ticker = (result.value.instrumentTicker ?? '').trim()
			if (!ticker) {
				if (requestAcceptsFrameSubmitHtml(context.request)) {
					const guidelines = await loadGuidelinesForSession(context)
					return guidelinesListFragmentHtmlResponse({
						guidelines,
						inlineError: t('errors.guidelines.addFormInvalid'),
						status: 422,
					})
				}
				return createRedirectResponse(guidelinesIndexHref('instrument'))
			}
			const match = findCatalogEntryByTicker(catalog, ticker)
			if (!match) {
				if (requestAcceptsFrameSubmitHtml(context.request)) {
					const guidelines = await loadGuidelinesForSession(context)
					return guidelinesListFragmentHtmlResponse({
						guidelines,
						inlineError: t('errors.guidelines.catalogEntryStale'),
						status: 422,
					})
				}
				return createRedirectResponse(guidelinesIndexHref('instrument'))
			}

			const { targetPct } = result.value
			const entry: EtfGuideline = {
				id: crypto.randomUUID(),
				kind: 'instrument',
				etfName: match.ticker,
				targetPct,
				etfType: match.type,
			}

			const capError = await persistGuideline({
				entry,
				session,
				remixSession: context.get(Session),
				request: context.request,
				context,
				addTab: 'instrument',
			})
			if (capError) return capError
			if (requestAcceptsFrameSubmitHtml(context.request)) {
				const guidelines = await loadGuidelinesForSession(context)
				return guidelinesListFragmentHtmlResponse({ guidelines })
			}
			return createRedirectResponse(guidelinesIndexHref('instrument'))
		},

		async assetClass(context: AppRequestContext) {
			const form = context.get(FormData)
			if (!form) {
				if (requestAcceptsFrameSubmitHtml(context.request)) {
					const guidelines = await loadGuidelinesForSession(context)
					return guidelinesListFragmentHtmlResponse({
						guidelines,
						inlineError: t('errors.guidelines.addFormInvalid'),
						status: 422,
					})
				}
				return createRedirectResponse(guidelinesIndexHref('bucket'))
			}

			const formPayload = objectFromFormData(form)
			normalizeGuidelineTargetPctInput(formPayload)
			const result = parseSafe(AssetClassGuidelineSchema, formPayload)
			if (!result.success) {
				if (requestAcceptsFrameSubmitHtml(context.request)) {
					const guidelines = await loadGuidelinesForSession(context)
					return guidelinesListFragmentHtmlResponse({
						guidelines,
						inlineError: t('errors.guidelines.addFormInvalid'),
						status: 422,
					})
				}
				return createRedirectResponse(guidelinesIndexHref('bucket'))
			}

			const session = getSessionData(context.get(Session))
			const catalog = await fetchCatalog()
			const allowedAssetClasses = new Set(
				assetClassSelectOptionsFromCatalog(catalog).map((o) => o.value),
			)

			const raw = (result.value.assetClassType ?? '').trim()
			if (!raw || !isEtfType(raw) || !allowedAssetClasses.has(raw)) {
				if (requestAcceptsFrameSubmitHtml(context.request)) {
					const guidelines = await loadGuidelinesForSession(context)
					return guidelinesListFragmentHtmlResponse({
						guidelines,
						inlineError: t('errors.guidelines.assetClassStale'),
						status: 422,
					})
				}
				return createRedirectResponse(guidelinesIndexHref('bucket'))
			}

			const { targetPct } = result.value
			const entry: EtfGuideline = {
				id: crypto.randomUUID(),
				kind: 'asset_class',
				etfName: '',
				targetPct,
				etfType: raw,
			}

			const capError = await persistGuideline({
				entry,
				session,
				remixSession: context.get(Session),
				request: context.request,
				context,
				addTab: 'bucket',
			})
			if (capError) return capError
			if (requestAcceptsFrameSubmitHtml(context.request)) {
				const guidelines = await loadGuidelinesForSession(context)
				return guidelinesListFragmentHtmlResponse({ guidelines })
			}
			return createRedirectResponse(guidelinesIndexHref('bucket'))
		},

		async updateTarget(context: AppRequestContext) {
			const id = (context.params as Record<string, string>).id
			if (!id) return createRedirectResponse(routes.guidelines.index.href())

			const form = context.get(FormData)
			if (!form) return createRedirectResponse(routes.guidelines.index.href())

			const formPayload = objectFromFormData(form)
			normalizeGuidelineTargetPctInput(formPayload)
			const result = parseSafe(UpdateGuidelineTargetSchema, formPayload)
			if (!result.success) {
				return guidelinesUpdateSchemaValidationResponse({
					context,
					request: context.request,
					session: context.get(Session),
					issues: result.issues,
				})
			}

			const session = getSessionData(context.get(Session))
			const persistError = await updateGuidelineTarget({
				id,
				newTargetPercent: result.value.targetPct,
				session,
				remixSession: context.get(Session),
				request: context.request,
				context,
			})
			if (persistError) return persistError

			if (requestAcceptsFrameSubmitHtml(context.request)) {
				const guidelines = await loadGuidelinesForSession(context)
				return guidelinesListFragmentHtmlResponse({ guidelines })
			}
			return createRedirectResponse(routes.guidelines.index.href())
		},

		async delete(context: AppRequestContext) {
			const id = (context.params as Record<string, string>).id
			if (!id) return createRedirectResponse(routes.guidelines.index.href())

			const session = getSessionData(context.get(Session))

			if (session?.gistId && session.token) {
				const current = await fetchGuidelines(session.token, session.gistId)
				await saveGuidelines(
					session.token,
					session.gistId,
					current.filter((g) => g.id !== id),
				)
			} else {
				setGuestGuidelines(
					context.get(Session),
					getGuestGuidelines(context.get(Session)).filter((g) => g.id !== id),
				)
			}

			if (requestAcceptsFrameSubmitHtml(context.request)) {
				const guidelines = await loadGuidelinesForSession(context)
				return guidelinesListFragmentHtmlResponse({ guidelines })
			}
			return createRedirectResponse(routes.guidelines.index.href())
		},

		async fragmentList(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			const guidelines =
				session?.gistId && session.token
					? await fetchGuidelines(session.token, session.gistId)
					: getGuestGuidelines(context.get(Session))
			return createHtmlResponse(
				renderToStream(jsx(GuidelinesListFragment, { guidelines })),
				{ headers: { 'Cache-Control': 'no-store' } },
			)
		},
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
async function renderGuidelinesPage(params: {
	guidelines: EtfGuideline[]
	session: SessionData | null
	catalog: CatalogEntry[]
	flashBanner?: FlashedBanner
	activeAddTab: GuidelinesAddTabId
}) {
	const { guidelines, session, catalog, flashBanner, activeAddTab } = params
	const assetClassOptions = assetClassSelectOptionsFromCatalog(catalog)
	const instrumentOptions = instrumentSelectOptionsFromCatalog(catalog)
	const body = jsx(GuidelinesPage, {
		assetClassOptions,
		instrumentOptions,
		activeAddTab,
	})
	return render({
		title: t('meta.title.guidelines'),
		htmlLang: htmlLangForCurrentUiLocale(),
		session,
		currentPage: 'guidelines',
		body,
		flashBanner,
		resolveFrame(source) {
			if (source === routes.guidelines.fragmentList.href()) {
				return renderToStream(jsx(GuidelinesListFragment, { guidelines }))
			}
			return ''
		},
	})
}
