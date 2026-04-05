import {
	addEventListeners,
	clientEntry,
	createElement,
	navigate,
} from 'remix/component'
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

/**
 * Intercepts forms with `data-frame-submit="<frameName>"` and POSTs via
 * fetch. On success, reloads the named Remix Frame so the server re-renders
 * the list region. Supports `data-error-id` for 422 JSON validation errors
 * and `data-reset-form` to clear fields after success.
 */
export const FrameSubmitEnhancement = clientEntry(
	'/components/frame-submit.component.js#FrameSubmitEnhancement',
	function FrameSubmitEnhancement(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				async submit(event) {
					const form = event.target
					if (!(form instanceof HTMLFormElement)) return

					const frameName = form.dataset.frameSubmit
					if (!frameName) return
					const frameReloadSrc = form.dataset.frameReloadSrc?.trim()

					if (!form.checkValidity()) {
						form.reportValidity()
						return
					}

					event.preventDefault()

					const submitControl = getSubmitControl(form, event.submitter)
					const errorId = form.dataset.errorId
					const resetForm = form.hasAttribute('data-reset-form')

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

					setSubmitButtonLoading(submitControl, true)
					hideError()

					try {
						const response = await fetch(form.action, {
							method: form.method,
							body: createFormData(form, submitControl),
							redirect: 'follow',
							headers: { Accept: 'application/json' },
						})

						if (response.ok) {
							const frameHandle = handle.frames.get(frameName)
							let refreshed = false
							if (frameReloadSrc && frameReloadSrc.length > 0) {
								const fragmentUrl = new URL(
									frameReloadSrc,
									window.location.href,
								).href
								const documentUrl = new URL(form.action, window.location.href)
									.href
								if (typeof globalThis.navigation?.navigate === 'function') {
									await navigate(documentUrl, {
										target: frameName,
										src: fragmentUrl,
										history: 'replace',
									})
									refreshed = true
								} else if (frameHandle) {
									await frameHandle.reload()
									refreshed = true
								} else {
									window.location.assign(documentUrl)
									refreshed = true
								}
							} else if (frameHandle) {
								await frameHandle.reload()
								refreshed = true
							}
							if (!refreshed && response.url) {
								window.location.assign(response.url)
							}
							if (resetForm) form.reset()
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
						setSubmitButtonLoading(submitControl, false)
					}
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'frame-submit-enhancement',
			})
	},
)
