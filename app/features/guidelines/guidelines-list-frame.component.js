import { clientEntry, createElement } from 'remix/ui'
import { setSubmitButtonLoading } from '../../components/client/submit-button-loading.component.js'
import { addEventListeners } from '../../lib/event-listeners.js'

const FRAME_NAME = 'guidelines-list'

/**
 * UX layer for every `guidelines-list`-targeting form: the add-instrument and
 * add-bucket forms above the frame, plus the per-row update-target and delete
 * forms rendered inside it. All four moved to native `data-rmx-target`, POSTing
 * to the single `guidelines.action` route and discriminated by a hidden
 * `guidelineIntent` field (see `docs/UI_ARCHITECTURE_GUIDELINES.md` §9 and
 * `docs/REMIX_RC_MIGRATION_STATUS.md`) — required because `data-rmx-target`
 * commits the form's `action` as the document URL regardless of which frame
 * it targets, so every form's action has to equal the page's own URL.
 *
 * This hooks the frame's `reloadStart` / `reloadComplete` events instead of
 * the retired `FrameSubmitEnhancement` submit interception. One document-level
 * `submit` listener covers all four forms — two live outside the frame, two
 * are re-rendered inside it on every reload — and records which form/control
 * submitted so the frame events below know what to do. `reloadStart` /
 * `reloadComplete` fire for *any* reload of the named frame, including ones
 * this form's own submit did not cause (e.g. a same-page locale switch
 * reusing the persisted `Frame`), so both handlers gate on that recorded
 * submit and do nothing otherwise.
 *
 * `closeAllOpenHtmlDialogs` replaces `frame-submit.component.js`'s pre-replace
 * dialog close: the rc.2 diff applies `<dialog>`'s `open` attribute as live
 * state (`shouldPreserveLiveAttribute` in `@remix-run/ui`'s `diff-dom`), so a
 * delete confirmation left open would otherwise survive the frame swap that
 * just removed its row.
 */
export const GuidelinesListFrame = clientEntry(
	'/features/guidelines/guidelines-list-frame.component.js#GuidelinesListFrame',
	function GuidelinesListFrame(handle) {
		const frameHandle = handle.frames.get(FRAME_NAME)
		if (typeof document !== 'undefined' && frameHandle) {
			let pendingSubmit = null

			addEventListeners(document, handle.signal, {
				submit(event) {
					const form = event.target
					if (
						!(form instanceof HTMLFormElement) ||
						form.getAttribute('data-rmx-target') !== FRAME_NAME
					) {
						return
					}
					const submitter = event.submitter
					const control =
						submitter instanceof HTMLButtonElement ||
						(submitter instanceof HTMLInputElement &&
							submitter.type === 'submit')
							? submitter
							: form.querySelector(
									'button[type="submit"], input[type="submit"]',
								)
					pendingSubmit = { form, control }
				},
			})

			frameHandle.addEventListener(
				'reloadStart',
				() => {
					if (!pendingSubmit) return
					for (const dialog of document.querySelectorAll('dialog')) {
						if (dialog instanceof HTMLDialogElement && dialog.open) {
							dialog.close()
						}
					}
					setSubmitButtonLoading(pendingSubmit.control, true)
				},
				{ signal: handle.signal },
			)
			frameHandle.addEventListener(
				'reloadComplete',
				() => {
					if (!pendingSubmit) return
					const { form, control } = pendingSubmit
					pendingSubmit = null
					setSubmitButtonLoading(control, false)
					// The frame swap already happened by the time `reloadComplete`
					// fires. A 422 inline-error response renders
					// `guidelines-list-fragment.tsx`'s `role="alert"` banner, the
					// only one on this page — its presence is the only signal we
					// have (the event carries no response data) that the
					// submission failed and the add form should keep its values.
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
				'data-component': 'guidelines-list-frame',
			})
	},
)
