import { addEventListeners, clientEntry, createElement } from 'remix/component'
import { openDialogForTrigger } from '../../lib/dialog-trigger.js'

export const EtfCardInteractions = clientEntry(
	'/features/portfolio/etf-card.component.js#EtfCardInteractions',
	function EtfCardInteractions() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'etf-card-interactions',
				connect: (node, signal) => {
					const doc = node.ownerDocument
					addEventListeners(doc, signal, {
						click(event) {
							const target = event.target
							if (!(target instanceof Element)) return

							const trigger = target.closest('[data-dialog-id]')
							if (!(trigger instanceof HTMLElement)) return
							if (trigger.hasAttribute('data-enhance-dialog')) return
							openDialogForTrigger(trigger, doc)
						},
						submit(event) {
							const form = event.target
							if (!(form instanceof HTMLFormElement)) return
							if (!form.hasAttribute('data-enhance-dialog')) return
							event.preventDefault()
							openDialogForTrigger(form, doc)
						},
					})
				},
			})
	},
)
