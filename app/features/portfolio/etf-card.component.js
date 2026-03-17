import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

export const EtfCardInteractions = clientEntry(
	'/features/portfolio/etf-card.component.js#EtfCardInteractions',
	function EtfCardInteractions() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'etf-card-interactions',
				connect: (_node, signal) => {
					if (typeof document === 'undefined') return
					const dispose = on(document, {
						click(event) {
							const target = event.target
							if (!(target instanceof Element)) return

							const trigger = target.closest('.etf-remove-trigger')
							if (!(trigger instanceof HTMLElement)) return

							const dialogId = trigger.dataset.dialogId
							if (!dialogId) return
							const dialog = document.getElementById(dialogId)
							if (!(dialog instanceof HTMLDialogElement)) return
							dialog.showModal()
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
