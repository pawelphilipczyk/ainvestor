import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'
import { setSubmitButtonLoading } from '../../components/submit-button-loading.component.js'

function isBankEtfResponse(json) {
	return (
		json &&
		typeof json === 'object' &&
		Array.isArray(json.data) &&
		json.data.length > 0
	)
}

export const CatalogPasteInteractions = clientEntry(
	'/features/catalog/catalog-paste.component.js#CatalogPasteInteractions',
	function CatalogPasteInteractions() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'catalog-paste-interactions',
				connect: (node, signal) => {
					const doc = node.ownerDocument
					const form = doc.querySelector('form[data-catalog-paste-zone]')
					if (!form || !(form instanceof HTMLFormElement)) return

					const pasteTextarea = form.querySelector('#pasteZone')
					const submitButton = form.querySelector(
						'button[type="submit"], input[type="submit"]',
					)

					function setCatalogPasteLoading(loading) {
						if (pasteTextarea instanceof HTMLTextAreaElement) {
							pasteTextarea.disabled = loading
						}
						setSubmitButtonLoading(submitButton, loading)
					}

					const dispose = on(form, {
						paste(event) {
							event.preventDefault()
							const text = event.clipboardData?.getData('text')
							if (!text) return

							let json
							try {
								json = JSON.parse(text)
							} catch {
								return
							}
							if (!isBankEtfResponse(json)) return

							if (pasteTextarea instanceof HTMLTextAreaElement) {
								pasteTextarea.value = text
							}

							setCatalogPasteLoading(true)
							fetch(form.action, {
								method: form.method,
								body: new FormData(form),
								redirect: 'follow',
								headers: { Accept: 'application/json' },
							})
								.then(async (r) => {
									if (r.redirected) {
										window.location.href = r.url
										return
									}
									if (!r.ok) {
										let bodyText = ''
										try {
											bodyText = await r.text()
										} catch (readError) {
											console.error(
												'[catalog-paste] could not read response body',
												readError,
											)
										}
										console.error('[catalog-paste] import failed', {
											status: r.status,
											statusText: r.statusText,
											body: bodyText,
										})
									}
									setCatalogPasteLoading(false)
								})
								.catch((error) => {
									console.error('[catalog-paste] import request failed', error)
									setCatalogPasteLoading(false)
								})
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
