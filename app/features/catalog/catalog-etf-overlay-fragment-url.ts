import { appShellEtfCloseHrefFromHref } from '../../lib/app-shell-etf-modal.ts'
import { routes } from '../../routes.ts'
import { ETF_DETAIL_SEARCH_PARAM } from './catalog-etf-search-param.ts'

/**
 * GET URL for the ETF overlay shell fragment (`CatalogEtfDetailOverlay` HTML).
 * Used by `data-catalog-etf-overlay-fetch` for instant modal open without a full navigation.
 */
export function catalogEtfOverlayShellFragmentHref(destinationHref: string): string | null {
	try {
		const parsed = new URL(destinationHref, 'https://catalog-etf-overlay.invalid')
		const entryId = parsed.searchParams.get(ETF_DETAIL_SEARCH_PARAM)
		if (entryId === null || entryId.trim().length === 0) return null

		const close = appShellEtfCloseHrefFromHref(destinationHref)
		const shellPath = routes.catalog.fragmentEtfOverlayShell.href({
			catalogEntryId: entryId,
		})
		const params = new URLSearchParams({ close })
		const model = parsed.searchParams.get('model')
		if (model !== null && model.length > 0) {
			params.set('model', model)
		}
		return `${shellPath}?${params.toString()}`
	} catch {
		return null
	}
}
