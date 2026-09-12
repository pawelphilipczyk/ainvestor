import { clientEntry, createElement } from 'remix/ui'
import { watchFrameFormSubmissions } from '../../components/client/frame-form-ux.component.js'

/**
 * UX layer for the catalog list's filter form (`data-rmx-target="catalog-list"`,
 * `method="get"`): busy state on the submit button while a filter change
 * reloads the frame. See `watchFrameFormSubmissions` for the shared
 * mechanics. Unlike every other `data-rmx-target` form ported so far, this
 * one has no validation and no error path, so it needs neither
 * `data-reset-form` nor `data-frame-hide-form-on-success`.
 */
export const CatalogListFrame = clientEntry(
	'/features/catalog/catalog-list-frame.component.js#CatalogListFrame',
	function CatalogListFrame(handle) {
		watchFrameFormSubmissions(handle, 'catalog-list')

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'catalog-list-frame',
			})
	},
)
