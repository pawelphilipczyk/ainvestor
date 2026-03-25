import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { object, optional, parseSafe, string } from 'remix/data-schema'
import { max, min } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import { render } from '../../components/render.ts'
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
} from '../../lib/guidelines.ts'
import type { SessionData } from '../../lib/session.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import { resetTestSessionCookieJar } from '../../lib/test-session-fetch.ts'
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

export function resetGuestGuidelines() {
	resetTestSessionCookieJar()
}

async function persistGuideline(
	entry: EtfGuideline,
	session: SessionData | null,
	remixSession: Session,
) {
	if (session?.gistId && session.token) {
		const current = await fetchGuidelines(session.token, session.gistId)
		await saveGuidelines(session.token, session.gistId, [entry, ...current])
	} else {
		setGuestGuidelines(remixSession, [
			entry,
			...getGuestGuidelines(remixSession),
		])
	}
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const guidelinesController = {
	async index(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const layoutSession = getLayoutSession(context.session)
		const [guidelines, catalog] = await Promise.all([
			session?.gistId && session.token
				? fetchGuidelines(session.token, session.gistId)
				: getGuestGuidelines(context.session),
			session?.gistId && session.token
				? fetchCatalog(session.token, session.gistId)
				: getGuestCatalog(context.session),
		])
		return renderGuidelinesPage({ guidelines, session: layoutSession, catalog })
	},

	async instrument(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.guidelines.index.href())

		const result = parseSafe(
			InstrumentGuidelineSchema,
			Object.fromEntries(
				form as unknown as Iterable<[string, FormDataEntryValue]>,
			),
		)
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

		await persistGuideline(entry, session, context.session)
		return createRedirectResponse(routes.guidelines.index.href())
	},

	async assetClass(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.guidelines.index.href())

		const result = parseSafe(
			AssetClassGuidelineSchema,
			Object.fromEntries(
				form as unknown as Iterable<[string, FormDataEntryValue]>,
			),
		)
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

		await persistGuideline(entry, session, context.session)
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
}) {
	const { guidelines, session, catalog } = params
	const assetClassOptions = assetClassSelectOptionsFromCatalog(catalog)
	const instrumentOptions = instrumentSelectOptionsFromCatalog(catalog)
	const body = jsx(GuidelinesPage, {
		guidelines,
		assetClassOptions,
		instrumentOptions,
	})
	return render({
		title: 'AI Investor – Guidelines',
		session,
		currentPage: 'guidelines',
		body,
	})
}
