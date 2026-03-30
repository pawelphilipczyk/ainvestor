/**
 * Opens the `<dialog>` identified by `trigger.dataset.dialogId` (HTML: `data-dialog-id`).
 * The trigger may be a `type="button"` control or an element that wraps it (e.g. a `<form>`).
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
