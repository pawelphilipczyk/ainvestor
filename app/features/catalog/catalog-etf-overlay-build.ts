import { jsx } from 'remix/component/jsx-runtime'
import type { RenderToStreamOptions } from 'remix/component/server'
import { renderToStream } from 'remix/component/server'
import { format, t } from '../../lib/i18n.ts'
import { routes } from '../../routes.ts'
import {
	ADVICE_MODEL_IDS,
	type AdviceModelId,
	DEFAULT_ADVICE_MODEL,
} from '../advice/advice-openai.ts'
import { CatalogEtfAnalysisFragment } from './catalog-etf-analysis-fragment.tsx'
import { CatalogEtfDetailOverlay } from './catalog-etf-detail-overlay.tsx'
import {
	CatalogEtfModalBodyFragment,
	type CatalogEtfModalBodyFragmentProps,
} from './catalog-etf-modal-body-fragment.tsx'
import { parseEtfDetailSearchParam } from './catalog-etf-search-param.ts'
import type { CatalogEntry } from './lib.ts'

export function parseOptionalAdviceModelFromUrl(url: string): AdviceModelId {
	const raw = new URL(url).searchParams.get('model')
	if (raw && (ADVICE_MODEL_IDS as readonly string[]).includes(raw)) {
		return raw as AdviceModelId
	}
	return DEFAULT_ADVICE_MODEL
}

function equivalentSearchStrings(searchA: string, searchB: string): boolean {
	if (searchA === searchB) return true
	const normalize = (raw: string) =>
		raw.startsWith('?') ? raw.slice(1) : raw
	const paramsA = new URLSearchParams(normalize(searchA))
	const paramsB = new URLSearchParams(normalize(searchB))
	const keys = new Set([...paramsA.keys(), ...paramsB.keys()])
	for (const key of keys) {
		const valuesA = paramsA.getAll(key).sort()
		const valuesB = paramsB.getAll(key).sort()
		if (valuesA.length !== valuesB.length) return false
		for (let index = 0; index < valuesA.length; index++) {
			if (valuesA[index] !== valuesB[index]) return false
		}
	}
	return true
}

/** Same document path and equivalent query (order-insensitive) for Frame `resolveFrame` matching. */
export function samePathAndSearch(a: string, b: string): boolean {
	try {
		const urlA = new URL(a, 'https://frame-resolve.local')
		const urlB = new URL(b, 'https://frame-resolve.local')
		return (
			urlA.pathname === urlB.pathname &&
			equivalentSearchStrings(urlA.search, urlB.search)
		)
	} catch {
		return a === b
	}
}

export function catalogEtfAnalysisFrameSrc(
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

/**
 * Server-side helper: catalog fund detail dialog when `?etf=` is present on a page
 * that supplies `closeHref` (catalog index or advice).
 */
export function buildCatalogDetailOverlayForSearchParam(options: {
	requestUrl: string
	catalog: CatalogEntry[]
	pendingApproval: boolean
	closeHref: string
}) {
	const etfId = parseEtfDetailSearchParam(options.requestUrl)
	if (etfId === null) {
		return {
			overlay: null,
			analysisFrameSrc: null,
			titleWhenOpen: null,
		}
	}
	const entry = options.catalog.find((row) => row.id === etfId)
	if (entry === undefined) {
		return {
			overlay: null,
			analysisFrameSrc: null,
			titleWhenOpen: null,
		}
	}
	const model = parseOptionalAdviceModelFromUrl(options.requestUrl)
	const catalogFallbackHref = options.closeHref
	if (options.pendingApproval) {
		const modalBodyProps: CatalogEtfModalBodyFragmentProps = {
			entry,
			catalogFallbackHref,
			descriptionText: t('catalog.etfDetail.pendingBody'),
		}
		return {
			overlay: jsx(CatalogEtfDetailOverlay, {
				entry,
				closeHref: options.closeHref,
				modalBody: jsx(CatalogEtfModalBodyFragment, modalBodyProps),
			}),
			analysisFrameSrc: null,
			titleWhenOpen: format(t('meta.title.catalogEtf'), { name: entry.name }),
		}
	}
	const analysisFrameSrc = catalogEtfAnalysisFrameSrc(entry.id, model)
	const modalBodyProps: CatalogEtfModalBodyFragmentProps = {
		entry,
		catalogFallbackHref,
		analysisPostHref: routes.catalog.etfAnalysis.href({
			catalogEntryId: entry.id,
		}),
		analysisFrameSrc,
		selectedModel: model,
	}
	return {
		overlay: jsx(CatalogEtfDetailOverlay, {
			entry,
			closeHref: options.closeHref,
			modalBody: jsx(CatalogEtfModalBodyFragment, modalBodyProps),
		}),
		analysisFrameSrc,
		titleWhenOpen: format(t('meta.title.catalogEtf'), { name: entry.name }),
	}
}

export type CatalogDetailOverlaySearchParamBuild = ReturnType<
	typeof buildCatalogDetailOverlayForSearchParam
>

/**
 * `resolveFrame` layer for the nested AI analysis `<Frame>` inside the inlined modal body.
 * Compose with `composeResolveFrame` from `app/lib/compose-resolve-frame.ts` and the route resolver.
 */
export function resolveCatalogDetailModalFrameLayer(
	built: CatalogDetailOverlaySearchParamBuild,
): RenderToStreamOptions['resolveFrame'] | undefined {
	const { analysisFrameSrc } = built
	if (analysisFrameSrc === null) {
		return undefined
	}
	return (source) => {
		if (samePathAndSearch(source, analysisFrameSrc)) {
			return renderToStream(jsx(CatalogEtfAnalysisFragment, {}))
		}
		return ''
	}
}
