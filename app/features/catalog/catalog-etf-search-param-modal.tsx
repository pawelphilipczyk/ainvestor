import type { Handle } from 'remix/component'
import type { CatalogEtfDetailOverlayForSearchParamResult } from './catalog-etf-overlay-build.ts'

/**
 * Opt-in ETF detail modal for pages that use `?etf=`.
 * Build once with {@link buildCatalogEtfDetailOverlayForSearchParam} and pass `built` here;
 * merge streaming with {@link mergeEtfOverlayResolveFrame}.
 */
export function CatalogEtfSearchParamModal(_handle: Handle, _setup?: unknown) {
	return (props: { built: CatalogEtfDetailOverlayForSearchParamResult }) =>
		props.built.overlay
}
