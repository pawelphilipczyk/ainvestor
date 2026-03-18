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

							fetch(url, {
								method: 'POST',
								body: text,
								headers: { 'Content-Type': 'application/json' },
								redirect: 'follow',
							}).then((r) => {
								if (r.redirected) {
									window.location.href = r.url
								}
							})
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
