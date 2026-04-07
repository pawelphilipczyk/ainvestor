import { addEventListeners, clientEntry, createElement } from 'remix/component'

/**
 * Holding row actions: scroll to the trade form and set operation + fund.
 * Triggers use `data-portfolio-trade-focus` and `data-portfolio-operation` (buy|sell)
 * plus `data-instrument-ticker` (catalog form value).
 */
export const PortfolioTradeFocus = clientEntry(
	'/features/portfolio/portfolio-trade-focus.component.js#PortfolioTradeFocus',
	function PortfolioTradeFocus(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const trigger = target.closest('[data-portfolio-trade-focus]')
					if (!(trigger instanceof HTMLElement)) return
					const ticker = trigger.dataset.instrumentTicker?.trim()
					const operation = trigger.dataset.portfolioOperation?.trim()
					if (!ticker || (operation !== 'buy' && operation !== 'sell')) return

					const formCard = document.getElementById('portfolio-operation-form')
					if (formCard) {
						formCard.scrollIntoView({ behavior: 'smooth', block: 'start' })
					}

					const form = document.getElementById('portfolio-trade-form')
					if (!(form instanceof HTMLFormElement)) return

					const op = form.querySelector('#portfolioOperation')
					if (op instanceof HTMLSelectElement) {
						op.value = operation
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
				'data-component': 'portfolio-trade-focus',
			})
	},
)
