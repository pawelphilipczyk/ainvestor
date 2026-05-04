import { jsx } from 'remix/component/jsx-runtime'
import { format, t } from '../../lib/i18n.ts'
import { routes } from '../../routes.ts'
import {
	ADVICE_MODEL_IDS,
	type AdviceModelId,
	DEFAULT_ADVICE_MODEL,
} from '../advice/advice-openai.ts'
import { CatalogEtfDetailOverlay } from './catalog-etf-detail-overlay.tsx'
import { parseEtfDetailSearchParam } from './catalog-etf-search-param.ts'
import type { CatalogEntry } from './lib.ts'

export function parseOptionalAdviceModelFromUrl(url: string): AdviceModelId {
	const raw = new URL(url).searchParams.get('model')
	if (raw && (ADVICE_MODEL_IDS as readonly string[]).includes(raw)) {
		return raw as AdviceModelId
	}
	return DEFAULT_ADVICE_MODEL
}

export function samePathAndSearch(a: string, b: string): boolean {
	try {
		const urlA = new URL(a, 'https://frame-resolve.local')
		const urlB = new URL(b, 'https://frame-resolve.local')
		return urlA.pathname === urlB.pathname && urlA.search === urlB.search
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
 * Server-side helper: ETF detail dialog content when `?etf=` is present on a page
 * that supplies `closeHref` (catalog index or advice).
 */
export function buildCatalogEtfDetailOverlayForSearchParam(options: {
	requestUrl: string
	catalog: CatalogEntry[]
	pendingApproval: boolean
	closeHref: string
}): {
	overlay: ReturnType<typeof jsx> | null
	analysisFrameSrc: string | null
	titleWhenOpen: string | null
} {
	const etfId = parseEtfDetailSearchParam(options.requestUrl)
	if (etfId === null) {
		return { overlay: null, analysisFrameSrc: null, titleWhenOpen: null }
	}
	const entry = options.catalog.find((row) => row.id === etfId)
	if (entry === undefined) {
		return { overlay: null, analysisFrameSrc: null, titleWhenOpen: null }
	}
	const model = parseOptionalAdviceModelFromUrl(options.requestUrl)
	const catalogFallbackHref = options.closeHref
	if (options.pendingApproval) {
		return {
			overlay: jsx(CatalogEtfDetailOverlay, {
				entry,
				closeHref: options.closeHref,
				catalogFallbackHref,
				descriptionText: t('catalog.etfDetail.pendingBody'),
			}),
			analysisFrameSrc: null,
			titleWhenOpen: format(t('meta.title.catalogEtf'), { name: entry.name }),
		}
	}
	const analysisFrameSrc = catalogEtfAnalysisFrameSrc(entry.id, model)
	return {
		overlay: jsx(CatalogEtfDetailOverlay, {
			entry,
			closeHref: options.closeHref,
			catalogFallbackHref,
			analysisPostHref: routes.catalog.etfAnalysis.href({
				catalogEntryId: entry.id,
			}),
			analysisFrameSrc,
			selectedModel: model,
		}),
		analysisFrameSrc,
		titleWhenOpen: format(t('meta.title.catalogEtf'), { name: entry.name }),
	}
}
