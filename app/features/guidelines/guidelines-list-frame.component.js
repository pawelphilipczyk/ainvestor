import { clientEntry, createElement } from 'remix/ui'
import { watchFrameFormSubmissions } from '../../components/client/frame-form-ux.component.js'

/**
 * UX layer for every `guidelines-list`-targeting form: the add-instrument and
 * add-bucket forms above the frame, plus the per-row update-target and delete
 * forms rendered inside it. All four POST to the single `guidelines.action`
 * route and are discriminated by a hidden `guidelineIntent` field (see
 * `docs/UI_ARCHITECTURE_GUIDELINES.md` §10) — required because `data-rmx-target`
 * commits the form's `action` as the document URL regardless of which frame
 * it targets, so every form's action has to equal the page's own URL.
 *
 * See `watchFrameFormSubmissions` for the shared mechanics. `closeDialogsOnReload`
 * is on here (and not for portfolio's trade form) because the delete form lives
 * inside a confirmation `<dialog>`.
 */
export const GuidelinesListFrame = clientEntry(
	'/features/guidelines/guidelines-list-frame.component.js#GuidelinesListFrame',
	function GuidelinesListFrame(handle) {
		watchFrameFormSubmissions(handle, 'guidelines-list', {
			closeDialogsOnReload: true,
		})

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'guidelines-list-frame',
			})
	},
)
