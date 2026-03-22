import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

const SPINNER_ID = 'form-spinner'

function setSubmitButtonLoading(button, loading) {
	if (!(button instanceof HTMLElement)) return
	const spinnerTemplate = document.getElementById(SPINNER_ID)
	if (!spinnerTemplate) return
	if (loading) {
		button.dataset.originalContent = button.innerHTML
		button.innerHTML = ''
		button.append(...spinnerTemplate.cloneNode(true).childNodes)
		button.setAttribute('disabled', '')
		button.setAttribute('aria-busy', 'true')
	} else {
		const original = button.dataset.originalContent
		if (original) {
			button.innerHTML = original
			delete button.dataset.originalContent
		}
		button.removeAttribute('disabled')
		button.removeAttribute('aria-busy')
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
			const el = document.getElementById(errorId)
			if (el) {
				el.textContent = ''
				el.classList.add('hidden')
			}
		}
	}

	const showError = (message) => {
		if (errorId) {
			const el = document.getElementById(errorId)
			if (el) {
				el.textContent = message
				el.classList.remove('hidden')
			}
		}
	}

	setSubmitButtonLoading(submitBtn, true)
	hideError()

	try {
		const res = await fetch(form.action, {
			method: form.method,
			body: new FormData(form),
			redirect: 'follow',
			headers: { Accept: 'application/json' },
		})

		if (res.ok) {
			if (fragmentId && fragmentUrl) {
				const fragRes = await fetch(fragmentUrl, {
					headers: { Accept: 'text/html' },
				})
				if (fragRes.ok) {
					const html = await fragRes.text()
					const container = document.getElementById(fragmentId)
					if (container) {
						container.innerHTML = html
						if (resetForm) form.reset()
					}
				}
			} else if (replaceMain) {
				const html = await res.text()
				const parser = new DOMParser()
				const doc = parser.parseFromString(html, 'text/html')
				const main = doc.querySelector('main')
				const pageContent = document.getElementById('page-content')
				if (main && pageContent) {
					pageContent.innerHTML = main.outerHTML
				}
				if (resetForm) form.reset()
			} else {
				window.location.href = res.url
			}
		} else if (replaceMain) {
			const html = await res.text()
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
		} else if (res.status === 422 && errorId) {
			const data = await res.json().catch(() => ({}))
			showError(data.error || 'Please check your input.')
		} else {
			window.location.href = res.url || '/'
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
							event.preventDefault()
							const submitBtn = form.querySelector(
								'button[type="submit"], input[type="submit"]',
							)
							await handleFetchSubmit(form, submitBtn)
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
