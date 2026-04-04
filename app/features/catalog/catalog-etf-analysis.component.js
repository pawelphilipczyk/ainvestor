import { addEventListeners, clientEntry, createElement } from 'remix/component'

function readClientMessages() {
	try {
		const el = document.getElementById('ui-client-messages')
		if (!el?.textContent) return {}
		return JSON.parse(el.textContent)
	} catch {
		return {}
	}
}

export const CatalogEtfAnalysisInteractions = clientEntry(
	'/features/catalog/catalog-etf-analysis.component.js#CatalogEtfAnalysisInteractions',
	function CatalogEtfAnalysisInteractions(handle) {
		let activeRequestId = 0

		if (typeof document !== 'undefined') {
			const doc = document
			addEventListeners(doc, handle.signal, {
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const button = target.closest('[data-catalog-etf-analysis]')
					if (!(button instanceof HTMLButtonElement)) return
					if (button.disabled) return

					const postUrl = button.getAttribute('data-post-url')
					if (!postUrl) return

					const section = button.closest('[data-catalog-etf-analysis-section]')
					if (!(section instanceof HTMLElement)) return

					const output = section.querySelector(
						'[data-catalog-etf-analysis-output]',
					)
					const statusEl = section.querySelector(
						'[data-catalog-etf-analysis-status]',
					)
					if (!(output instanceof HTMLElement)) return

					const model = button.getAttribute('data-model') ?? ''
					const messages = readClientMessages()
					const networkError =
						typeof messages.catalogEtfAnalysisNetworkError === 'string'
							? messages.catalogEtfAnalysisNetworkError
							: 'Something went wrong.'

					const requestId = ++activeRequestId
					button.disabled = true
					button.setAttribute('aria-busy', 'true')
					button.setAttribute('data-loading', '')
					if (statusEl instanceof HTMLElement) {
						statusEl.textContent = ''
						statusEl.classList.add('hidden')
					}
					output.classList.add('hidden')
					output.textContent = ''

					void (async () => {
						try {
							const response = await fetch(postUrl, {
								method: 'POST',
								headers: {
									Accept: 'application/json',
									'Content-Type': 'application/json',
								},
								body: JSON.stringify({ model }),
							})
							const payload = await response.json().catch(() => ({}))
							if (requestId !== activeRequestId) return

							if (!response.ok) {
								const message =
									typeof payload.error === 'string' && payload.error.length > 0
										? payload.error
										: networkError
								if (statusEl instanceof HTMLElement) {
									statusEl.textContent = message
									statusEl.classList.remove('hidden')
								}
								button.disabled = false
								button.removeAttribute('aria-busy')
								button.removeAttribute('data-loading')
								return
							}

							const text = typeof payload.text === 'string' ? payload.text : ''
							output.textContent = text
							output.classList.remove('hidden')
							button.classList.add('hidden')
							button.removeAttribute('aria-busy')
							button.removeAttribute('data-loading')
						} catch {
							if (requestId !== activeRequestId) return
							if (statusEl instanceof HTMLElement) {
								statusEl.textContent = networkError
								statusEl.classList.remove('hidden')
							}
							button.disabled = false
							button.removeAttribute('aria-busy')
							button.removeAttribute('data-loading')
						}
					})()
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'catalog-etf-analysis-interactions',
			})
	},
)
