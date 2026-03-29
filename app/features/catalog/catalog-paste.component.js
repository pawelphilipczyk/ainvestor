import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

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
					const zone = doc.querySelector('[data-catalog-paste-zone]')
					if (!zone || !(zone instanceof HTMLElement)) return

					const url = zone.dataset.importUrl
					if (!url) return

					const importSection = doc.querySelector(
						'[data-catalog-import-section]',
					)
					const pasteTextarea = zone.querySelector('#pasteZone')
					const spinnerSlot = doc.querySelector('[data-catalog-import-spinner]')
					const spinnerIconHost = doc.getElementById('form-spinner-icon')

					function setCatalogImportLoading(loading) {
						if (pasteTextarea instanceof HTMLTextAreaElement) {
							pasteTextarea.disabled = loading
						}
						if (importSection) {
							if (loading) {
								importSection.setAttribute('aria-busy', 'true')
							} else {
								importSection.removeAttribute('aria-busy')
							}
						}
						if (spinnerSlot) {
							if (loading) {
								spinnerSlot.classList.remove('hidden')
								spinnerSlot.replaceChildren()
								const spinner =
									spinnerIconHost?.firstElementChild?.cloneNode(true)
								if (spinner) spinnerSlot.append(spinner)
							} else {
								spinnerSlot.classList.add('hidden')
								spinnerSlot.replaceChildren()
							}
						}
					}

					const dispose = on(zone, {
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

							setCatalogImportLoading(true)
							fetch(url, {
								method: 'POST',
								body: text,
								headers: { 'Content-Type': 'application/json' },
								redirect: 'follow',
							})
								.then((r) => {
									if (r.redirected) {
										window.location.href = r.url
										return
									}
									setCatalogImportLoading(false)
								})
								.catch(() => {
									setCatalogImportLoading(false)
								})
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
