import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'
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
