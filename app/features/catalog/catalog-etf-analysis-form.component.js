import { addEventListeners, clientEntry, createElement } from 'remix/component'
import { setSubmitButtonLoading } from '../../components/submit-button-loading.component.js'

const FORM_ATTR = 'data-catalog-etf-analysis-form'

function readClientMessages() {
	try {
		const el = document.getElementById('ui-client-messages')
		if (!el?.textContent) return {}
		return JSON.parse(el.textContent)
	} catch {
		return {}
	}
}

export const CatalogEtfAnalysisFormEnhancement = clientEntry(
	'/features/catalog/catalog-etf-analysis-form.component.js#CatalogEtfAnalysisFormEnhancement',
	function CatalogEtfAnalysisFormEnhancement(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				async submit(event) {
					const form = event.target
					if (!(form instanceof HTMLFormElement)) return
					if (!form.hasAttribute(FORM_ATTR)) return
					if (!form.checkValidity()) {
						form.reportValidity()
						return
					}
					event.preventDefault()

					const submitControl =
						event.submitter instanceof HTMLElement
							? event.submitter
							: form.querySelector(
									'button[type="submit"], input[type="submit"]',
								)

					const resultSelector = form.getAttribute('data-result-target')
					const errorSelector = form.getAttribute('data-error-target')
					const resultEl = resultSelector
						? document.querySelector(resultSelector)
						: null
					const errorEl = errorSelector
						? document.querySelector(errorSelector)
						: null

					const msgs = readClientMessages()
					const networkFallback =
						typeof msgs.catalogEtfAnalysisNetworkError === 'string'
							? msgs.catalogEtfAnalysisNetworkError
							: typeof msgs.genericFormError === 'string'
								? msgs.genericFormError
								: 'Something went wrong.'

					const clearError = () => {
						if (errorEl) {
							errorEl.textContent = ''
							errorEl.classList.add('hidden')
						}
					}
					const showError = (message) => {
						if (errorEl) {
							errorEl.textContent = message
							errorEl.classList.remove('hidden')
						}
					}

					setSubmitButtonLoading(submitControl, true)
					clearError()
					if (resultEl) {
						resultEl.textContent = ''
						resultEl.classList.add('hidden')
					}

					try {
						const payload = {}
						for (const field of form.querySelectorAll(
							'input[name], select[name], textarea[name]',
						)) {
							if (
								field instanceof HTMLInputElement &&
								(field.type === 'submit' || field.type === 'button')
							) {
								continue
							}
							if (field.name) payload[field.name] = field.value
						}

						const response = await fetch(form.action, {
							method: form.method,
							body: JSON.stringify(payload),
							headers: {
								Accept: 'application/json',
								'Content-Type': 'application/json',
							},
						})
						const data = await response.json().catch(() => ({}))

						if (response.ok) {
							if (resultEl) {
								resultEl.textContent =
									typeof data.text === 'string' ? data.text : ''
								resultEl.classList.remove('hidden')
							}
							form.classList.add('hidden')
							return
						}

						const serverError =
							typeof data.error === 'string' && data.error.length > 0
								? data.error
								: networkFallback
						showError(serverError)
					} catch {
						showError(networkFallback)
					} finally {
						setSubmitButtonLoading(submitControl, false)
					}
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'catalog-etf-analysis-form-enhancement',
			})
	},
)
