import { clientEntry, createElement } from 'remix/ui'
import { setSubmitButtonLoading } from '../../components/client/submit-button-loading.component.js'

/**
 * UX layer for `#portfolio-trade-form`'s native `data-rmx-target="portfolio-list"`
 * submission: busy state on the submit button and `data-reset-form`, driven by the
 * `portfolio-list` frame's `reloadStart` / `reloadComplete` events instead of our own
 * submit interception (`FrameSubmitEnhancement`, still used by the page's other form).
 * The rc.2 runtime handles the fetch, the 422 inline-error swap and the frame replace
 * itself — see `docs/REMIX_RC_MIGRATION_STATUS.md`.
 */
export const PortfolioTradeFormFrame = clientEntry(
	'/features/portfolio/portfolio-trade-form-frame.component.js#PortfolioTradeFormFrame',
	function PortfolioTradeFormFrame(handle) {
		const frameHandle = handle.frames.get('portfolio-list')
		if (typeof document !== 'undefined' && frameHandle) {
			const getForm = () => document.getElementById('portfolio-trade-form')
			const getSubmitControl = () =>
				getForm()?.querySelector(
					'button[type="submit"], input[type="submit"]',
				) ?? null

			frameHandle.addEventListener(
				'reloadStart',
				() => {
					setSubmitButtonLoading(getSubmitControl(), true)
				},
				{ signal: handle.signal },
			)
			frameHandle.addEventListener(
				'reloadComplete',
				() => {
					setSubmitButtonLoading(getSubmitControl(), false)
					const form = getForm()
					// The frame swap already happened by the time `reloadComplete`
					// fires. A 422 inline-error response renders `list-fragment.tsx`'s
					// `role="alert"` banner, the only one on this page — its presence
					// is the only signal we have (the event carries no response data)
					// that the submission failed and the form should keep its values.
					const failed = document.querySelector('[role="alert"]') !== null
					if (
						!failed &&
						form instanceof HTMLFormElement &&
						form.hasAttribute('data-reset-form')
					) {
						form.reset()
					}
				},
				{ signal: handle.signal },
			)
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'portfolio-trade-form-frame',
			})
	},
)
