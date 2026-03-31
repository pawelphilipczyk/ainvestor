import { on } from '@remix-run/interaction'
import { clientEntry, createElement } from 'remix/component'
import { openDialogForTrigger } from '../../lib/dialog-trigger.js'

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

							const trigger = target.closest('[data-dialog-id]')
							if (!(trigger instanceof HTMLElement)) return
							openDialogForTrigger(trigger, doc)
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
