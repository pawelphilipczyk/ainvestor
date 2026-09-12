import { addEventListeners } from '../../lib/event-listeners.js'
import { setSubmitButtonLoading } from './submit-button-loading.component.js'

/**
 * UX layer shared by every page that ported a `data-rmx-target="<frame>"` form
 * off `FrameSubmitEnhancement`: busy state on the submit control,
 * `data-reset-form` on success, and `data-frame-hide-form-on-success` to hide
 * the form once its result has rendered — driven by the named frame's
 * `reloadStart` / `reloadComplete` events instead of a `submit` interception.
 * The rc.2 runtime handles the fetch, the 422 inline-error swap and the frame
 * replace itself — see `docs/REMIX_RC_MIGRATION_STATUS.md`.
 *
 * First written for the portfolio trade form (one form, fixed id — since
 * renamed `PortfolioListFrame` when the CSV import form joined it on the same
 * frame) and duplicated near-identically for `GuidelinesListFrame` (four forms
 * sharing one frame, matched generically). Extracted here on the second port
 * so the two stop being able to drift apart — see
 * `docs/REMIX_RC_MIGRATION_STATUS.md`.
 *
 * `reloadStart` / `reloadComplete` fire for *any* reload of the named frame,
 * not only ones a tracked form's own submit caused: a same-page soft
 * navigation elsewhere on the page (e.g. the locale `<select>`) reuses the
 * persisted `Frame` and dispatches an "inherited" reload on it too. Gate on a
 * `submit` event of a matching form first, so an unrelated reload never
 * touches a button or clears unsaved input.
 *
 * @param {import('remix/ui').Handle} handle
 * @param {string} frameName
 * @param {{ closeDialogsOnReload?: boolean }} [options]
 *   `closeDialogsOnReload`: close every open `<dialog>` before the frame's
 *   content is patched. The rc.2 diff applies `<dialog>`'s `open` attribute as
 *   live state it preserves across a patch (`shouldPreserveLiveAttribute` in
 *   `@remix-run/ui`'s `diff-dom`, same as `<input>` `value`/`checked`), so a
 *   confirmation dialog left open by one of the tracked forms (e.g. a delete
 *   confirmation) would otherwise survive a swap that just removed its row.
 *   Only needed when a tracked form can leave a dialog open — portfolio's
 *   trade form doesn't use one, so it leaves this off.
 */
export function watchFrameFormSubmissions(handle, frameName, options = {}) {
	const { closeDialogsOnReload = false } = options
	const frameHandle = handle.frames.get(frameName)
	if (typeof document === 'undefined' || !frameHandle) return

	/** @type {{ form: HTMLFormElement, control: Element | null } | null} */
	let pendingSubmit = null

	addEventListeners(document, handle.signal, {
		submit(event) {
			const form = event.target
			if (
				!(form instanceof HTMLFormElement) ||
				form.getAttribute('data-rmx-target') !== frameName
			) {
				return
			}
			const submitter = event.submitter
			const control =
				submitter instanceof HTMLButtonElement ||
				(submitter instanceof HTMLInputElement && submitter.type === 'submit')
					? submitter
					: form.querySelector('button[type="submit"], input[type="submit"]')
			pendingSubmit = { form, control }
		},
	})

	frameHandle.addEventListener(
		'reloadStart',
		() => {
			if (!pendingSubmit) return
			if (closeDialogsOnReload) {
				for (const dialog of document.querySelectorAll('dialog')) {
					if (dialog instanceof HTMLDialogElement && dialog.open) {
						dialog.close()
					}
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
			// The frame swap already happened by the time `reloadComplete` fires.
			// A 422 inline-error response renders the list fragment's `role="alert"`
			// banner, the only one on the page — its presence is the only signal we
			// have (the event carries no response data) that the submission failed
			// and the form should keep its values.
			const failed = document.querySelector('[role="alert"]') !== null
			if (!failed && form.hasAttribute('data-reset-form')) {
				form.reset()
			}
			if (!failed && form.hasAttribute('data-frame-hide-form-on-success')) {
				form.classList.add('hidden')
			}
		},
		{ signal: handle.signal },
	)
}
