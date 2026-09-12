import { clientEntry, createElement } from 'remix/ui'
import { watchFrameFormSubmissions } from '../../components/client/frame-form-ux.component.js'

/**
 * UX layer for `#portfolio-trade-form`'s native `data-rmx-target="portfolio-list"`
 * submission — see `watchFrameFormSubmissions` for the shared mechanics.
 * Import-etf-form stays on `FrameSubmitEnhancement` (still targets the same
 * `portfolio-list` frame via `replace()`, which does not dispatch
 * `reloadStart`/`reloadComplete`, so the two paths don't interfere).
 */
export const PortfolioTradeFormFrame = clientEntry(
	'/features/portfolio/portfolio-trade-form-frame.component.js#PortfolioTradeFormFrame',
	function PortfolioTradeFormFrame(handle) {
		watchFrameFormSubmissions(handle, 'portfolio-list')

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'portfolio-trade-form-frame',
			})
	},
)
