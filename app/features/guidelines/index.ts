import type { StandardSchemaV1 } from '@standard-schema/spec'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { object, optional, parseSafe, string } from 'remix/data-schema'
import { max, min } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { objectFromFormData } from '../../lib/form-data-payload.ts'
import {
	getGuestCatalog,
	getGuestGuidelines,
	setGuestGuidelines,
} from '../../lib/guest-session-state.ts'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import {
	fetchGuidelines,
	isEtfType,
	saveGuidelines,
	sumGuidelineTargetPct,
	wouldGuidelineTotalExceedCap,
} from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'
import { parseLocaleDecimalString } from '../../lib/locale-decimal-input.ts'
import type { SessionData } from '../../lib/session.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
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

function formatPctForMessage(value: number): string {
	const rounded = Math.round(value * 100) / 100
	if (Number.isInteger(rounded)) return String(rounded)
	return String(rounded)
}

function guidelinesTotalCapErrorResponse(params: {
	request: Request
	session: Session
	currentTotal: number
	addedPct: number
}): Response {
	const message = format(t('errors.guidelines.totalExceeds100'), {
		current: formatPctForMessage(params.currentTotal),
		added: formatPctForMessage(params.addedPct),
	})
	const prefersJson = params.request.headers
		.get('Accept')
		?.includes('application/json')
	if (prefersJson) {
		return new Response(JSON.stringify({ error: message }), {
			status: 422,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	params.session.flash('error', message)
	return createRedirectResponse(routes.guidelines.index.href())
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

function guidelinesUpdateSchemaValidationResponse(params: {
	request: Request
	session: Session
	issues: ReadonlyArray<StandardSchemaV1.Issue>
}): Response {
	const { error, details } = formatGuidelineTargetSchemaIssues(params.issues)
	const prefersJson = params.request.headers
		.get('Accept')
		?.includes('application/json')
	if (prefersJson) {
		return new Response(JSON.stringify({ error, issues: details }), {
			status: 422,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	params.session.flash('error', error)
	return createRedirectResponse(routes.guidelines.index.href())
}

function guidelinesUpdateCapErrorResponse(params: {
	request: Request
	session: Session
	newPct: number
	resultingTotal: number
}): Response {
	const message = format(t('errors.guidelines.updateTotalExceeds100'), {
		newPct: formatPctForMessage(params.newPct),
		total: formatPctForMessage(params.resultingTotal),
	})
	const prefersJson = params.request.headers
		.get('Accept')
		?.includes('application/json')
	if (prefersJson) {
		return new Response(JSON.stringify({ error: message }), {
			status: 422,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	params.session.flash('error', message)
	return createRedirectResponse(routes.guidelines.index.href())
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
}): Promise<Response | null> {
	const { entry, session, remixSession, request } = params
	if (session?.gistId && session.token) {
		const current = await fetchGuidelines(session.token, session.gistId)
		if (
			wouldGuidelineTotalExceedCap({
				existing: current,
				additionalPct: entry.targetPct,
			})
		) {
			return guidelinesTotalCapErrorResponse({
				request,
				session: remixSession,
				currentTotal: sumGuidelineTargetPct(current),
				addedPct: entry.targetPct,
			})
		}
		await saveGuidelines(session.token, session.gistId, [entry, ...current])
		return null
	}

	const current = getGuestGuidelines(remixSession)
	if (
		wouldGuidelineTotalExceedCap({
			existing: current,
			additionalPct: entry.targetPct,
		})
	) {
		return guidelinesTotalCapErrorResponse({
			request,
			session: remixSession,
			currentTotal: sumGuidelineTargetPct(current),
			addedPct: entry.targetPct,
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
	newPct: number
	session: SessionData | null
	remixSession: Session
	request: Request
}): Promise<Response | null> {
	const { id, newPct, session, remixSession, request } = params

	if (session?.gistId && session.token) {
		const current = await fetchGuidelines(session.token, session.gistId)
		const existing = current.find((g) => g.id === id)
		if (!existing) {
			return createRedirectResponse(routes.guidelines.index.href())
		}
		const others = current.filter((g) => g.id !== id)
		const resultingTotal = sumGuidelineTargetPct(others) + newPct
		if (
			wouldGuidelineTotalExceedCap({
				existing: others,
				additionalPct: newPct,
			})
		) {
			return guidelinesUpdateCapErrorResponse({
				request,
				session: remixSession,
				newPct,
				resultingTotal,
			})
		}
		await saveGuidelines(
			session.token,
			session.gistId,
			current.map((g) => (g.id === id ? { ...g, targetPct: newPct } : g)),
		)
		return null
	}

	const current = getGuestGuidelines(remixSession)
	const existing = current.find((g) => g.id === id)
	if (!existing) {
		return createRedirectResponse(routes.guidelines.index.href())
	}
	const others = current.filter((g) => g.id !== id)
	const resultingTotal = sumGuidelineTargetPct(others) + newPct
	if (
		wouldGuidelineTotalExceedCap({
			existing: others,
			additionalPct: newPct,
		})
	) {
		return guidelinesUpdateCapErrorResponse({
			request,
			session: remixSession,
			newPct,
			resultingTotal,
		})
	}
	setGuestGuidelines(
		remixSession,
		current.map((g) => (g.id === id ? { ...g, targetPct: newPct } : g)),
	)
	return null
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const guidelinesController = {
	async index(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const layoutSession = getLayoutSession(context.session)
		const flashError = context.session.get('error') as string | undefined
		const [guidelines, catalog] = await Promise.all([
			session?.gistId && session.token
				? fetchGuidelines(session.token, session.gistId)
				: getGuestGuidelines(context.session),
			session?.gistId && session.token
				? fetchCatalog(session.token, session.gistId)
				: getGuestCatalog(context.session),
		])
		return renderGuidelinesPage({
			guidelines,
			session: layoutSession,
			catalog,
			flashError,
		})
	},

	async instrument(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.guidelines.index.href())

		const formPayload = objectFromFormData(form)
		normalizeGuidelineTargetPctInput(formPayload)
		const result = parseSafe(InstrumentGuidelineSchema, formPayload)
		if (!result.success) {
			return createRedirectResponse(routes.guidelines.index.href())
		}

		const session = getSessionData(context.session)
		const catalog =
			session?.gistId && session.token
				? await fetchCatalog(session.token, session.gistId)
				: getGuestCatalog(context.session)

		const ticker = (result.value.instrumentTicker ?? '').trim()
		if (!ticker) {
			return createRedirectResponse(routes.guidelines.index.href())
		}
		const match = findCatalogEntryByTicker(catalog, ticker)
		if (!match) {
			return createRedirectResponse(routes.guidelines.index.href())
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
			remixSession: context.session,
			request: context.request,
		})
		if (capError) return capError
		return createRedirectResponse(routes.guidelines.index.href())
	},

	async assetClass(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.guidelines.index.href())

		const formPayload = objectFromFormData(form)
		normalizeGuidelineTargetPctInput(formPayload)
		const result = parseSafe(AssetClassGuidelineSchema, formPayload)
		if (!result.success) {
			return createRedirectResponse(routes.guidelines.index.href())
		}

		const session = getSessionData(context.session)
		const catalog =
			session?.gistId && session.token
				? await fetchCatalog(session.token, session.gistId)
				: getGuestCatalog(context.session)
		const allowedAssetClasses = new Set(
			assetClassSelectOptionsFromCatalog(catalog).map((o) => o.value),
		)

		const raw = (result.value.assetClassType ?? '').trim()
		if (!raw || !isEtfType(raw) || !allowedAssetClasses.has(raw)) {
			return createRedirectResponse(routes.guidelines.index.href())
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
			remixSession: context.session,
			request: context.request,
		})
		if (capError) return capError
		return createRedirectResponse(routes.guidelines.index.href())
	},

	async updateTarget(context: {
		request: Request
		session: Session
		formData: FormData | null
		params: unknown
	}) {
		const id = (context.params as Record<string, string>).id
		if (!id) return createRedirectResponse(routes.guidelines.index.href())

		const form = context.formData
		if (!form) return createRedirectResponse(routes.guidelines.index.href())

		const formPayload = objectFromFormData(form)
		normalizeGuidelineTargetPctInput(formPayload)
		const result = parseSafe(UpdateGuidelineTargetSchema, formPayload)
		if (!result.success) {
			return guidelinesUpdateSchemaValidationResponse({
				request: context.request,
				session: context.session,
				issues: result.issues,
			})
		}

		const session = getSessionData(context.session)
		const persistError = await updateGuidelineTarget({
			id,
			newPct: result.value.targetPct,
			session,
			remixSession: context.session,
			request: context.request,
		})
		if (persistError) return persistError

		return createRedirectResponse(routes.guidelines.index.href())
	},

	async delete(context: {
		request: Request
		session: Session
		params: unknown
	}) {
		const id = (context.params as Record<string, string>).id
		if (!id) return createRedirectResponse(routes.guidelines.index.href())

		const session = getSessionData(context.session)

		if (session?.gistId && session.token) {
			const current = await fetchGuidelines(session.token, session.gistId)
			await saveGuidelines(
				session.token,
				session.gistId,
				current.filter((g) => g.id !== id),
			)
		} else {
			setGuestGuidelines(
				context.session,
				getGuestGuidelines(context.session).filter((g) => g.id !== id),
			)
		}

		return createRedirectResponse(routes.guidelines.index.href())
	},

	async fragmentList(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const guidelines =
			session?.gistId && session.token
				? await fetchGuidelines(session.token, session.gistId)
				: getGuestGuidelines(context.session)
		const html = await renderToString(
			jsx(GuidelinesListFragment, { guidelines }),
		)
		return createHtmlResponse(html, {
			headers: { 'Cache-Control': 'no-store' },
		})
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
async function renderGuidelinesPage(params: {
	guidelines: EtfGuideline[]
	session: SessionData | null
	catalog: CatalogEntry[]
	flashError?: string
}) {
	const { guidelines, session, catalog, flashError } = params
	const assetClassOptions = assetClassSelectOptionsFromCatalog(catalog)
	const instrumentOptions = instrumentSelectOptionsFromCatalog(catalog)
	const body = jsx(GuidelinesPage, {
		guidelines,
		assetClassOptions,
		instrumentOptions,
	})
	return render({
		title: t('meta.title.guidelines'),
		session,
		currentPage: 'guidelines',
		body,
		flashError,
	})
}
