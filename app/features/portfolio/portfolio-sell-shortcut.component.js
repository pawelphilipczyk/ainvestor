import { addEventListeners, clientEntry, createElement } from 'remix/component'

/**
 * Holding row "Sell" buttons: scroll to the trade form and prefill operation + fund.
 * Uses `data-instrument-ticker` (catalog form value) on the trigger.
 */
export const PortfolioSellShortcut = clientEntry(
	'/features/portfolio/portfolio-sell-shortcut.component.js#PortfolioSellShortcut',
	function PortfolioSellShortcut(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const trigger = target.closest('[data-portfolio-sell-shortcut]')
					if (!(trigger instanceof HTMLElement)) return
					const ticker = trigger.dataset.instrumentTicker?.trim()
					if (!ticker) return

					const formCard = document.getElementById('portfolio-operation-form')
					if (formCard) {
						formCard.scrollIntoView({ behavior: 'smooth', block: 'start' })
					}

					const form = document.getElementById('portfolio-trade-form')
					if (!(form instanceof HTMLFormElement)) return

					const op = form.querySelector('#portfolioOperation')
					if (op instanceof HTMLSelectElement) {
						op.value = 'sell'
					}

					const inst = form.querySelector('#instrumentTicker')
					if (inst instanceof HTMLSelectElement) {
						const opt = Array.from(inst.options).find((o) => o.value === ticker)
						if (opt) {
							inst.value = ticker
						}
					}

					const valueInput = form.querySelector('#portfolio-trade-value')
					if (valueInput instanceof HTMLInputElement) {
						valueInput.value = ''
						valueInput.focus()
					}
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'portfolio-sell-shortcut',
			})
	},
)
