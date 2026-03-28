/**
 * Opens the `<dialog>` identified by `trigger.dataset.dialogId` (HTML: `data-dialog-id`).
 * Use `type="button"` and `data-dialog-id` on the trigger; no feature-specific class needed.
 *
 * @param {HTMLElement} trigger
 * @param {Document} doc
 */
export function openDialogForTrigger(trigger, doc) {
	const dialogId = trigger.dataset.dialogId
	if (!dialogId) return
	const dialog = doc.getElementById(dialogId)
	if (!(dialog instanceof HTMLDialogElement)) return
	if (dialog.open) return
	dialog.showModal()
}
