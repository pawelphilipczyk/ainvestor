import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

function openDialogForTrigger(trigger, doc) {
	const dialogId = trigger.dataset.dialogId
	if (!dialogId) return
	const dialog = doc.getElementById(dialogId)
	if (!(dialog instanceof HTMLDialogElement)) return
	if (dialog.open) return
	dialog.showModal()
}

export const GuidelinesDeleteDialogInteractions = clientEntry(
	'/features/guidelines/guidelines-list.component.js#GuidelinesDeleteDialogInteractions',
	function GuidelinesDeleteDialogInteractions() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'guidelines-delete-dialog-interactions',
				connect: (node, signal) => {
					const doc = node.ownerDocument
					const dispose = on(doc, {
						click(event) {
							const target = event.target
							if (!(target instanceof Element)) return

							const trigger = target.closest('.guideline-delete-trigger')
							if (!(trigger instanceof HTMLElement)) return
							openDialogForTrigger(trigger, doc)
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
