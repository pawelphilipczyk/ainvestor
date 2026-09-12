import { clientEntry, createElement } from 'remix/ui'
import { watchFrameFormSubmissions } from '../../components/client/frame-form-ux.component.js'

/**
 * UX layer for advice's 3 forms (buy-next run, portfolio-review run,
 * portfolio-review clear) — all post to the single `advice.action` route,
 * discriminated by the existing hidden `adviceIntent` field, and target the
 * `advice-result` Frame via native `data-rmx-target`. See
 * `watchFrameFormSubmissions` for the shared mechanics.
 */
export const AdviceResultFrame = clientEntry(
	'/features/advice/advice-result-frame.component.js#AdviceResultFrame',
	function AdviceResultFrame(handle) {
		watchFrameFormSubmissions(handle, 'advice-result')

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'advice-result-frame',
			})
	},
)
