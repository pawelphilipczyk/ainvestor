import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

const SPINNER_ICON_ID = 'form-spinner-icon'
const CLIENT_MESSAGES_ID = 'ui-client-messages'

function readClientMessages() {
	if (typeof document === 'undefined') return null
	const messagesElement = document.getElementById(CLIENT_MESSAGES_ID)
	if (!messagesElement?.textContent) return null
	try {
		return JSON.parse(messagesElement.textContent)
	} catch {
		return null
	}
}

function setSubmitButtonLoading(control, loading) {
	if (!(control instanceof HTMLElement)) return

	if (control instanceof HTMLInputElement && control.type === 'submit') {
		if (loading) {
			control.dataset.originalValue = control.value
			const msgs = readClientMessages()
			const loadingLabel =
				typeof msgs?.submitLoadingLabel === 'string'
					? msgs.submitLoadingLabel
					: 'Loading…'
			control.value = loadingLabel
			control.setAttribute('disabled', '')
			control.setAttribute('aria-busy', 'true')
		} else {
			const originalValue = control.dataset.originalValue
			if (originalValue !== undefined) {
				control.value = originalValue
				delete control.dataset.originalValue
			}
			control.removeAttribute('disabled')
			control.removeAttribute('aria-busy')
		}
		return
	}

	if (!(control instanceof HTMLButtonElement)) return

	const spinnerHost = document.getElementById(SPINNER_ICON_ID)

	if (loading) {
		control.setAttribute('disabled', '')
		control.setAttribute('aria-busy', 'true')
		if (spinnerHost) {
			control.dataset.originalContent = control.innerHTML
			const row = control.ownerDocument.createElement('span')
			row.className =
				'inline-flex w-full max-w-full items-center justify-center gap-2'
			const spinner = spinnerHost.firstElementChild?.cloneNode(true)
			const label = control.ownerDocument.createElement('span')
			label.className = 'submit-button-busy-label min-w-0 flex-1 text-center'
			label.innerHTML = control.innerHTML
			control.innerHTML = ''
			if (spinner) row.append(spinner)
			row.append(label)
			control.append(row)
		}
	} else {
		const original = control.dataset.originalContent
		if (original !== undefined) {
			control.innerHTML = original
			delete control.dataset.originalContent
		}
		control.removeAttribute('disabled')
		control.removeAttribute('aria-busy')
	}
}

async function handleFetchSubmit(form, submitBtn) {
	const fragmentId = form.dataset.fragmentId
	const fragmentUrl = form.dataset.fragmentUrl
	const errorId = form.dataset.errorId
	const resetForm = form.hasAttribute('data-reset-form')
	const replaceMain = form.hasAttribute('data-replace-main')

	const hideError = () => {
		if (errorId) {
			const errorElement = document.getElementById(errorId)
			if (errorElement) {
				errorElement.textContent = ''
				errorElement.classList.add('hidden')
			}
		}
	}

	const showError = (message) => {
		if (errorId) {
			const errorElement = document.getElementById(errorId)
			if (errorElement) {
				errorElement.textContent = message
				errorElement.classList.remove('hidden')
			}
		}
	}

	setSubmitButtonLoading(submitBtn, true)
	hideError()

	try {
		const response = await fetch(form.action, {
			method: form.method,
			body: new FormData(form),
			redirect: 'follow',
			headers: { Accept: 'application/json' },
		})

		if (response.ok) {
			if (fragmentId && fragmentUrl) {
				const fragmentResponse = await fetch(fragmentUrl, {
					headers: { Accept: 'text/html' },
				})
				if (fragmentResponse.ok) {
					const html = await fragmentResponse.text()
					const container = document.getElementById(fragmentId)
					if (container) {
						container.innerHTML = html
						if (resetForm) form.reset()
					}
				}
			} else if (replaceMain) {
				const html = await response.text()
				const parser = new DOMParser()
				const doc = parser.parseFromString(html, 'text/html')
				const main = doc.querySelector('main')
				const pageContent = document.getElementById('page-content')
				if (main && pageContent) {
					pageContent.innerHTML = main.outerHTML
				}
				if (resetForm) form.reset()
			} else {
				window.location.href = response.url
			}
		} else if (replaceMain) {
			const html = await response.text()
			const parser = new DOMParser()
			const doc = parser.parseFromString(html, 'text/html')
			const main = doc.querySelector('main')
			const pageContent = document.getElementById('page-content')
			if (main && pageContent) {
				pageContent.innerHTML = main.outerHTML
			} else {
				// Keep the fetched HTML (e.g. error page) instead of replaying as GET.
				document.open()
				document.write(html)
				document.close()
			}
		} else if (response.status === 422 && errorId) {
			const data = await response.json().catch(() => ({}))
			const msgs = readClientMessages()
			const fallback =
				typeof msgs?.genericFormError === 'string'
					? msgs.genericFormError
					: 'Please check your input.'
			showError(data.error || fallback)
		} else {
			window.location.href = response.url || '/'
		}
	} catch {
		window.location.href = '/'
	} finally {
		setSubmitButtonLoading(submitBtn, false)
	}
}

export const FetchSubmitEnhancement = clientEntry(
	'/components/fetch-submit.component.js#FetchSubmitEnhancement',
	function FetchSubmitEnhancement() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'fetch-submit-enhancement',
				connect: (node, signal) => {
					const doc = node.ownerDocument
					const dispose = on(doc, {
						async submit(event) {
							const form = event.target
							if (
								!(form instanceof HTMLFormElement) ||
								!form.hasAttribute('data-fetch-submit')
							) {
								return
							}
							if (!form.checkValidity()) {
								form.reportValidity()
								return
							}
							event.preventDefault()
							const submitBtn = form.querySelector(
								'button[type="submit"], input[type="submit"]',
							)
							/** Full document navigation after loading UI; use when fetch cannot replace the flow (e.g. external redirects). */
							if (form.hasAttribute('data-full-page-navigation')) {
								setSubmitButtonLoading(submitBtn, true)
								window.location.assign(form.action)
								return
							}
							await handleFetchSubmit(form, submitBtn)
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
