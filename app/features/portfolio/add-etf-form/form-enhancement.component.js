import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

const FRAGMENT_URL = '/fragments/portfolio-list'
const LIST_ID = 'portfolio-list'
const ERROR_ID = 'portfolio-form-error'

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
							const wasDisabled = submitBtn?.hasAttribute('disabled')
							if (submitBtn instanceof HTMLElement) {
								submitBtn.setAttribute('disabled', '')
							}
							try {
								hideFormError()
								const res = await fetch(form.action, {
									method: form.method,
									body: new FormData(form),
									redirect: 'manual',
								})
								if (res.status >= 300 && res.status < 400) {
									const flashError = res.headers.get('X-Flash-Error')
									if (flashError) {
										showFormError(flashError)
									} else {
										const html = await fetchListFragment()
										replaceListContent(html)
										form.reset()
									}
								} else {
									window.location.href = res.url || form.action
								}
							} catch {
								window.location.href = form.action
							} finally {
								if (submitBtn instanceof HTMLElement && !wasDisabled) {
									submitBtn.removeAttribute('disabled')
								}
							}
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
