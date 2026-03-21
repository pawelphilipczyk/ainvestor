import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { enum_, object, optional, parseSafe, string } from 'remix/data-schema'
import { max, min } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import type {
	EtfGuideline,
	EtfType,
	GuidelineKind,
} from '../../lib/guidelines.ts'
import {
	fetchGuidelines,
	GUIDELINE_KINDS,
	isEtfType,
	saveGuidelines,
} from '../../lib/guidelines.ts'
import type { SessionData } from '../../lib/session.ts'
import { getSessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { getGuestCatalog } from '../catalog/index.ts'
import type { CatalogEntry } from '../catalog/lib.ts'
import {
	assetClassSelectOptionsFromCatalog,
	fetchCatalog,
} from '../catalog/lib.ts'
import { GuidelinesListFragment } from './guidelines-list-fragment.tsx'
import { GuidelinesPage } from './guidelines-page.tsx'

const CreateGuidelineSchema = object({
	kind: optional(enum_(GUIDELINE_KINDS)),
	etfName: optional(string()),
	targetPct: coerce.number().pipe(min(0.001), max(100)),
	etfType: optional(string()),
	assetClassType: optional(string()),
})

// ---------------------------------------------------------------------------
// Guest state
// ---------------------------------------------------------------------------
let guestGuidelines: EtfGuideline[] = []

export function resetGuestGuidelines() {
	guestGuidelines = []
}

export function getGuestGuidelines(): EtfGuideline[] {
	return guestGuidelines
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const guidelinesController = {
	async index(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const [guidelines, catalog] = await Promise.all([
			session?.gistId
				? fetchGuidelines(session.token, session.gistId)
				: guestGuidelines,
			session?.gistId
				? fetchCatalog(session.token, session.gistId)
				: getGuestCatalog(),
		])
		return renderGuidelinesPage(guidelines, session, catalog)
	},

	async action(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.guidelines.index.href())

		const result = parseSafe(
			CreateGuidelineSchema,
			Object.fromEntries(
				form as unknown as Iterable<[string, FormDataEntryValue]>,
			),
		)
		if (!result.success) {
			return createRedirectResponse(routes.guidelines.index.href())
		}

		const kind = (result.value.kind ?? 'instrument') as GuidelineKind
		const etfNameTrim = (result.value.etfName ?? '').trim()
		if (kind === 'instrument' && etfNameTrim.length === 0) {
			return createRedirectResponse(routes.guidelines.index.href())
		}

		const session = getSessionData(context.session)
		const catalog = session?.gistId
			? await fetchCatalog(session.token, session.gistId)
			: getGuestCatalog()
		const allowedAssetClasses = new Set(
			assetClassSelectOptionsFromCatalog(catalog).map((o) => o.value),
		)

		let etfType: EtfType
		if (kind === 'asset_class') {
			const raw = (result.value.assetClassType ?? '').trim()
			if (!raw || !isEtfType(raw) || !allowedAssetClasses.has(raw)) {
				return createRedirectResponse(routes.guidelines.index.href())
			}
			etfType = raw
		} else {
			const raw = (result.value.etfType ?? 'equity').trim()
			if (!isEtfType(raw)) {
				return createRedirectResponse(routes.guidelines.index.href())
			}
			etfType = raw
		}

		const { targetPct } = result.value
		const entry: EtfGuideline = {
			id: crypto.randomUUID(),
			kind,
			etfName: kind === 'asset_class' ? '' : etfNameTrim,
			targetPct,
			etfType,
		}

		if (session?.gistId) {
			const current = await fetchGuidelines(session.token, session.gistId)
			await saveGuidelines(session.token, session.gistId, [entry, ...current])
		} else {
			guestGuidelines = [entry, ...guestGuidelines]
		}

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

		if (session?.gistId) {
			const current = await fetchGuidelines(session.token, session.gistId)
			await saveGuidelines(
				session.token,
				session.gistId,
				current.filter((g) => g.id !== id),
			)
		} else {
			guestGuidelines = guestGuidelines.filter((g) => g.id !== id)
		}

		return createRedirectResponse(routes.guidelines.index.href())
	},

	async fragmentList(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const guidelines = session?.gistId
			? await fetchGuidelines(session.token, session.gistId)
			: guestGuidelines
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
async function renderGuidelinesPage(
	guidelines: EtfGuideline[],
	session: SessionData | null,
	catalog: CatalogEntry[],
) {
	const assetClassOptions = assetClassSelectOptionsFromCatalog(catalog)
	const body = jsx(GuidelinesPage, { guidelines, assetClassOptions })
	return render({
		title: 'AI Investor – Guidelines',
		session,
		currentPage: 'guidelines',
		body,
	})
}
