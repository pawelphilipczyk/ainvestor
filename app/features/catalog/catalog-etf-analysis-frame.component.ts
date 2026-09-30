import { clientEntry, createElement } from 'remix/ui'
import { watchFrameFormSubmissions } from '../../components/client/frame-form-ux.component.ts'

/**
 * UX layer for the ETF detail page's `data-rmx-target="catalog-etf-analysis"`
 * "load analysis" form — see `watchFrameFormSubmissions` for the shared
 * mechanics. `data-frame-hide-form-on-success` hides the form once the
 * analysis has loaded so the button doesn't linger above the result.
 */
export const CatalogEtfAnalysisFrame = clientEntry(
	`${import.meta.url}#CatalogEtfAnalysisFrame`,
	function CatalogEtfAnalysisFrame(handle) {
		watchFrameFormSubmissions(handle, 'catalog-etf-analysis')

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'catalog-etf-analysis-frame',
			})
	},
)
