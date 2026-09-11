import { clientEntry, createElement } from 'remix/ui'
import { setSubmitButtonLoading } from '../../components/client/submit-button-loading.component.js'
import { addEventListeners } from '../../lib/event-listeners.js'

const FORM_ID = 'portfolio-trade-form'

/**
 * UX layer for `#portfolio-trade-form`'s native `data-rmx-target="portfolio-list"`
 * submission: busy state on the submit button and `data-reset-form`, driven by the
 * `portfolio-list` frame's `reloadStart` / `reloadComplete` events instead of our own
 * submit interception (`FrameSubmitEnhancement`, still used by the page's other form).
 * The rc.2 runtime handles the fetch, the 422 inline-error swap and the frame replace
 * itself — see `docs/REMIX_RC_MIGRATION_STATUS.md`.
 *
 * `reloadStart` / `reloadComplete` fire for *any* reload of the named frame, not only
 * ones this form's own submit caused: a same-page soft navigation elsewhere on the
 * page (e.g. the locale `<select>`) reuses the persisted `Frame` and dispatches an
 * "inherited" reload on it too. Gate on a `submit` event of this exact form first, so
 * an unrelated reload never touches the button or clears the user's unsaved input.
 */
export const PortfolioTradeFormFrame = clientEntry(
	'/features/portfolio/portfolio-trade-form-frame.component.js#PortfolioTradeFormFrame',
	function PortfolioTradeFormFrame(handle) {
		const frameHandle = handle.frames.get('portfolio-list')
		if (typeof document !== 'undefined' && frameHandle) {
			const getForm = () => document.getElementById(FORM_ID)
			const getSubmitControl = () =>
				getForm()?.querySelector(
					'button[type="submit"], input[type="submit"]',
				) ?? null

			let pendingSubmit = false
			addEventListeners(document, handle.signal, {
				submit(event) {
					if (
						event.target instanceof HTMLFormElement &&
						event.target.id === FORM_ID
					) {
						pendingSubmit = true
					}
				},
			})

			frameHandle.addEventListener(
				'reloadStart',
				() => {
					if (!pendingSubmit) return
					setSubmitButtonLoading(getSubmitControl(), true)
				},
				{ signal: handle.signal },
			)
			frameHandle.addEventListener(
				'reloadComplete',
				() => {
					if (!pendingSubmit) return
					pendingSubmit = false
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
