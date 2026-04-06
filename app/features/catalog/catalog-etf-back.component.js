import { addEventListeners, clientEntry, createElement } from 'remix/component'

const ATTR = 'data-catalog-etf-back'

function isModifiedClick(event) {
	return (
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey
	)
}

export const CatalogEtfBackEnhancement = clientEntry(
	'/features/catalog/catalog-etf-back.component.js#CatalogEtfBackEnhancement',
	function CatalogEtfBackEnhancement(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const anchor = target.closest(`a[${ATTR}]`)
					if (
						!(anchor instanceof HTMLAnchorElement) ||
						!anchor.hasAttribute(ATTR)
					) {
						return
					}
					if (isModifiedClick(event)) return
					if (anchor.hasAttribute('download')) return
					const anchorTarget = anchor.getAttribute('target')
					if (anchorTarget && anchorTarget !== '_self') return

					event.preventDefault()
					if (typeof history !== 'undefined' && history.length > 1) {
						history.back()
						return
					}
					const href = anchor.getAttribute('href')
					if (href && !href.startsWith('#')) {
						window.location.assign(anchor.href)
					}
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'catalog-etf-back-enhancement',
			})
	},
)
