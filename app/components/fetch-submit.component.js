import { addEventListeners, clientEntry, createElement } from 'remix/component'
import { setSubmitButtonLoading } from './submit-button-loading.component.js'

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

function getSubmitControl(form, submitter) {
	if (
		submitter instanceof HTMLButtonElement ||
		(submitter instanceof HTMLInputElement && submitter.type === 'submit')
	) {
		return submitter
	}

	return form.querySelector('button[type="submit"], input[type="submit"]')
}

function createFormData(form, submitControl) {
	if (
		submitControl instanceof HTMLButtonElement ||
		(submitControl instanceof HTMLInputElement &&
			submitControl.type === 'submit')
	) {
		try {
			return new FormData(form, submitControl)
		} catch {
			return new FormData(form)
		}
	}

	return new FormData(form)
}

function buildGetNavigationUrl(form, submitControl) {
	const actionUrl = new URL(form.action, window.location.href)
	const searchParams = new URLSearchParams(actionUrl.search)

	for (const [name, value] of createFormData(form, submitControl).entries()) {
		if (typeof value === 'string') {
			searchParams.append(name, value)
		}
	}

	actionUrl.search = searchParams.toString()
	return actionUrl.toString()
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
	function FetchSubmitEnhancement(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				async submit(event) {
					const form = event.target
					if (!(form instanceof HTMLFormElement)) {
						return
					}

					const submitControl = getSubmitControl(form, event.submitter)

					if (form.hasAttribute('data-fetch-submit')) {
						if (!form.checkValidity()) {
							form.reportValidity()
							return
						}
						event.preventDefault()
						await handleFetchSubmit(form, submitControl)
						return
					}

					if (
						!form.hasAttribute('data-navigation-loading') ||
						form.method.toLowerCase() !== 'get'
					) {
						return
					}

					if (!form.checkValidity()) {
						form.reportValidity()
						return
					}

					event.preventDefault()
					setSubmitButtonLoading(submitControl, true)
					requestAnimationFrame(() => {
						window.location.assign(buildGetNavigationUrl(form, submitControl))
					})
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'fetch-submit-enhancement',
			})
	},
)
