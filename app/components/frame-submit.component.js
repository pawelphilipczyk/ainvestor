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

function buildGetNavigationUrl(form, submitControl) {
	const actionUrl = new URL(form.action, window.location.href)
	// Match native GET submit: query is only serialised form fields, not action's ?query.
	const searchParams = new URLSearchParams()

	for (const [name, value] of createFormData(form, submitControl).entries()) {
		if (typeof value === 'string') {
			searchParams.append(name, value)
		}
	}

	actionUrl.search = searchParams.toString()
	return actionUrl.toString()
}

/**
 * Full-document navigation via the Navigation API (no `window.location`).
 * Remix `navigate` attaches the frame runtime state the listener expects.
 */
async function navigateDocumentUrl(href, history = 'push') {
	if (typeof globalThis.navigation?.navigate !== 'function') {
		throw new Error(
			'[frame-submit] Document navigation requires window.navigation',
		)
	}
	await navigate(href, { history })
}

/**
 * `data-frame-replace-from-response` asks the server for **HTML** (`Accept: text/html`).
 * Valid errors should be HTML fragments (422 + `text/html`) so we never hit this path for
 * portfolio/guidelines/catalog flows. This branch only covers **unexpected** shapes:
 * e.g. 422 JSON if a route regresses, or a proxy error page — same fallback as the
 * non-replace JSON path (`data-error-id` + navigate).
 */
async function handleReplaceFromResponseNonHtmlError(
	response,
	showError,
	readClientMessages,
) {
	if (response.status === 422) {
		const data = await response.json().catch(() => ({}))
		const msgs = readClientMessages()
		const fallback =
			typeof msgs?.genericFormError === 'string'
				? msgs.genericFormError
				: 'Please check your input.'
		showError(data.error || fallback)
		return
	}
	await navigateDocumentUrl(response.url || '/')
}

/**
 * Intercepts forms with `data-frame-submit="<frameName>"` and POSTs via
 * fetch. On success, reloads the named Remix Frame so the server re-renders
 * the list region. Supports `data-error-id` for 422 JSON validation errors
 * and `data-reset-form` to clear fields after success.
 *
 * **`data-frame-reload-src`:** Optional fragment URL for the named frame.
 * After a successful POST, `frameHandle.reload()` alone can keep the frame on
 * the wrong `src` (e.g. still pointing at the document URL). Call
 * `navigate(documentUrl, { target: frameName, src: fragmentUrl, history: 'replace' })`
 * so the Navigation API updates that frame’s `src` before reload — same as
 * loading the full page with a resolved Frame.
 *
 * **`data-frame-replace-from-response`:** When set, POST uses `Accept: text/html`
 * and applies the response body into the named frame via `frameHandle.replace()`
 * when the response is HTML — including **422** validation fragments (portfolio /
 * guidelines list) as well as success HTML (e.g. catalog ETF analysis).
 *
 * **`data-frame-hide-form-on-success`:** With replace-from-response, hide the
 * submitted form after a successful HTML response (catalog analysis); omit for
 * forms that stay visible (portfolio list updates).
 *
 * **`data-frame-get-fragment-action`:** For **`method="get"`** forms, optional
 * base URL of the **HTML fragment** that mirrors the document query (e.g. list
 * frame). When set, submit is intercepted: **`navigate(documentUrl, { target,
 * src: fragmentUrl, history: 'replace' })`** so the URL bar and named Frame
 * stay in sync without a separate GET submit handler.
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

					const method = form.method.toLowerCase()
					const getFragmentBase = form.dataset.frameGetFragmentAction?.trim()

					if (method === 'get' && getFragmentBase) {
						if (!form.checkValidity()) {
							form.reportValidity()
							return
						}
						event.preventDefault()
						const submitControl = getSubmitControl(form, event.submitter)
						setSubmitButtonLoading(submitControl, true)
						try {
							const documentUrl = buildGetNavigationUrl(form, submitControl)
							const fragmentUrl = new URL(getFragmentBase, window.location.href)
							const documentUrlObject = new URL(
								documentUrl,
								window.location.href,
							)
							fragmentUrl.search = documentUrlObject.search
							if (typeof globalThis.navigation?.navigate === 'function') {
								await navigate(documentUrl, {
									target: frameName,
									src: fragmentUrl.href,
									history: 'replace',
								})
							} else {
								window.location.assign(documentUrl)
							}
						} catch {
							window.location.assign('/')
						} finally {
							setSubmitButtonLoading(submitControl, false)
						}
						return
					}

					if (method !== 'post') {
						return
					}

					const frameReloadSrc = form.dataset.frameReloadSrc?.trim()
					const replaceFromResponse =
						form.dataset.frameReplaceFromResponse === '1' ||
						form.dataset.frameReplaceFromResponse === 'true'

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
						const acceptHeader = replaceFromResponse
							? 'text/html'
							: 'application/json'
						const response = await fetch(form.action, {
							method: form.method,
							body: createFormData(form, submitControl),
							redirect: 'follow',
							headers: { Accept: acceptHeader },
						})

						if (replaceFromResponse) {
							const contentType = response.headers.get('content-type') ?? ''
							if (contentType.includes('text/html')) {
								const html = await response.text()
								const frameHandle = handle.frames.get(frameName)
								if (frameHandle) {
									await frameHandle.replace(html)
									const hideFormOnSuccess =
										form.dataset.frameHideFormOnSuccess === '1' ||
										form.dataset.frameHideFormOnSuccess === 'true'
									if (response.ok && hideFormOnSuccess) {
										form.classList.add('hidden')
									}
								}
								if (resetForm && response.ok) form.reset()
								return
							}
							if (!response.ok) {
								await handleReplaceFromResponseNonHtmlError(
									response,
									showError,
									readClientMessages,
								)
								return
							}
						}

						if (response.ok) {
							const frameHandle = handle.frames.get(frameName)
							let refreshed = false
							// Gist save can fail while the model succeeds; fragment GET then 204. Swap in `<main>` from this response instead of reloading the frame.
							const gistStale =
								response.headers.get('X-Advice-Gist-Stale') === '1'
							if (gistStale) {
								const html = await response.text()
								const parser = new DOMParser()
								const doc = parser.parseFromString(html, 'text/html')
								const main = doc.querySelector('main')
								const pageContent = document.getElementById('page-content')
								if (main && pageContent) {
									pageContent.innerHTML = main.outerHTML
									refreshed = true
								} else {
									await navigateDocumentUrl(
										new URL(form.action, window.location.href).href,
									)
									refreshed = true
								}
							}
							if (!refreshed && frameReloadSrc && frameReloadSrc.length > 0) {
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
									await navigateDocumentUrl(documentUrl)
									refreshed = true
								}
							} else if (!refreshed && frameHandle) {
								await frameHandle.reload()
								refreshed = true
							}
							if (!refreshed && response.url) {
								await navigateDocumentUrl(response.url)
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
							await navigateDocumentUrl(response.url || '/')
						}
					} catch {
						await navigateDocumentUrl('/')
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
