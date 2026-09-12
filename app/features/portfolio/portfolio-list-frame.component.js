import { clientEntry, createElement } from 'remix/ui'
import { watchFrameFormSubmissions } from '../../components/client/frame-form-ux.component.js'

/**
 * UX layer for every `portfolio-list`-targeting form: the trade form
 * (`#portfolio-trade-form`) and the CSV import form, both posting to the
 * single `portfolio.action` route and discriminated by a hidden
 * `portfolioIntent` field (see `docs/UI_ARCHITECTURE_GUIDELINES.md` §10) —
 * required because `data-rmx-target` commits the form's `action` as the
 * document URL regardless of which frame it targets, so every form's action
 * has to equal the page's own URL.
 *
 * See `watchFrameFormSubmissions` for the shared mechanics.
 */
export const PortfolioListFrame = clientEntry(
	'/features/portfolio/portfolio-list-frame.component.js#PortfolioListFrame',
	function PortfolioListFrame(handle) {
		watchFrameFormSubmissions(handle, 'portfolio-list')

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'portfolio-list-frame',
			})
	},
)
