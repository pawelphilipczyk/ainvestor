import { addEventListeners, clientEntry, createElement } from 'remix/component'
import { openDialogForTrigger } from '../../lib/dialog-trigger.js'

export const GuidelinesDeleteDialogInteractions = clientEntry(
	'/features/guidelines/guidelines-list.component.js#GuidelinesDeleteDialogInteractions',
	function GuidelinesDeleteDialogInteractions(handle) {
		if (typeof document !== 'undefined') {
			const doc = document
			addEventListeners(doc, handle.signal, {
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return

					const trigger = target.closest('[data-dialog-id]')
					if (!(trigger instanceof HTMLElement)) return
					openDialogForTrigger(trigger, doc)
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'guidelines-delete-dialog-interactions',
			})
	},
)
