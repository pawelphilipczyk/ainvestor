import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

const FRAGMENT_URL = '/fragments/portfolio-list'
const LIST_ID = 'portfolio-list'
const ERROR_ID = 'portfolio-form-error'

const SPINNER_HTML = `<span class="inline-flex items-center gap-2" role="status" aria-live="polite">
	<span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true"></span>
	Adding…
</span>`

function setSubmitButtonLoading(button, loading) {
	if (!(button instanceof HTMLElement)) return
	if (loading) {
		button.dataset.originalContent = button.innerHTML
		button.innerHTML = SPINNER_HTML
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

async function fetchListFragment() {
	const res = await fetch(FRAGMENT_URL, { headers: { Accept: 'text/html' } })
	if (!res.ok) throw new Error(`Fragment fetch failed: ${res.status}`)
	return res.text()
}

function replaceListContent(html) {
	const container = document.getElementById(LIST_ID)
	if (!container) return
	container.innerHTML = html
}

function showFormError(message) {
	const el = document.getElementById(ERROR_ID)
	if (!el) return
	el.textContent = message
	el.classList.remove('hidden')
}

function hideFormError() {
	const el = document.getElementById(ERROR_ID)
	if (!el) return
	el.textContent = ''
	el.classList.add('hidden')
}

export const AddEtfFormEnhancement = clientEntry(
	'/features/portfolio/add-etf-form/form-enhancement.component.js#AddEtfFormEnhancement',
	function AddEtfFormEnhancement() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'add-etf-form-enhancement',
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
							setSubmitButtonLoading(submitBtn, true)
							try {
								hideFormError()
								const res = await fetch(form.action, {
									method: form.method,
									body: new FormData(form),
									redirect: 'follow',
									headers: { Accept: 'application/json' },
								})
								if (res.ok) {
									const html = await fetchListFragment()
									replaceListContent(html)
									form.reset()
								} else if (res.status === 422) {
									const data = await res.json().catch(() => ({}))
									showFormError(data.error || 'Please check your input.')
								} else {
									window.location.href = '/'
								}
							} catch {
								window.location.href = '/'
							} finally {
								setSubmitButtonLoading(submitBtn, false)
							}
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
