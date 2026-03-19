import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

const FRAGMENT_URL = '/fragments/portfolio-list'
const LIST_ID = 'portfolio-list'
const ERROR_ID = 'portfolio-form-error'
const OPTIMISTIC_ATTR = 'data-optimistic-placeholder'

function formatValue(value, currency) {
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
			maximumFractionDigits: 2,
		}).format(value)
	} catch {
		return `${value} ${currency}`
	}
}

function buildOptimisticPlaceholder(formData) {
	const name = formData.get('etfName')?.toString().trim() || '…'
	const rawValue = formData.get('value')?.toString().replace(/,/g, '') || '0'
	const value = Number.parseFloat(rawValue) || 0
	const currency = formData.get('currency')?.toString().toUpperCase() || 'USD'
	const exchange = formData.get('exchange')?.toString().trim() || ''
	const rawQty = formData.get('quantity')?.toString().replace(/,/g, '')
	const quantity = rawQty ? Number.parseInt(rawQty, 10) : null
	const details = [
		quantity ? `${quantity.toLocaleString()} shares` : '',
		exchange,
	]
		.filter(Boolean)
		.join(' · ')
	const badgeValue = formatValue(value, currency)
	return `<li ${OPTIMISTIC_ATTR} class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 opacity-75">
		<div class="flex min-w-0 flex-col gap-0.5">
			<strong class="font-semibold text-card-foreground">${escapeHtml(name)}</strong>
			${details ? `<span class="text-xs text-muted-foreground">${escapeHtml(details)}</span>` : ''}
		</div>
		<div class="flex items-center gap-3">
			<span class="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground whitespace-nowrap">${escapeHtml(badgeValue)}</span>
			<span class="rounded-md px-2 py-1 text-xs text-muted-foreground">Adding…</span>
		</div>
	</li>`
}

function escapeHtml(str) {
	const div = document.createElement('div')
	div.textContent = str
	return div.innerHTML
}

function insertOptimisticPlaceholder(form) {
	const container = document.getElementById(LIST_ID)
	if (!container) return
	const formData = new FormData(form)
	const placeholderHtml = buildOptimisticPlaceholder(formData)
	const firstChild = container.firstElementChild
	if (firstChild?.tagName === 'UL') {
		firstChild.insertAdjacentHTML('afterbegin', placeholderHtml)
	} else {
		container.innerHTML = `<ul class="mt-4 grid gap-2">${placeholderHtml}</ul>`
	}
}

function removeOptimisticPlaceholder() {
	const container = document.getElementById(LIST_ID)
	if (!container) return
	const placeholder = container.querySelector(`[${OPTIMISTIC_ATTR}]`)
	if (placeholder) placeholder.remove()
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
							const wasDisabled = submitBtn?.hasAttribute('disabled')
							if (submitBtn instanceof HTMLElement) {
								submitBtn.setAttribute('disabled', '')
							}
							try {
								hideFormError()
								insertOptimisticPlaceholder(form)
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
									removeOptimisticPlaceholder()
									const data = await res.json().catch(() => ({}))
									showFormError(data.error || 'Please check your input.')
								} else {
									removeOptimisticPlaceholder()
									window.location.href = '/'
								}
							} catch {
								removeOptimisticPlaceholder()
								window.location.href = '/'
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
