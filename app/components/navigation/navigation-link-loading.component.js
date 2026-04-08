import { addEventListeners, clientEntry, createElement } from 'remix/component'

const ATTR = 'data-navigation-loading'

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

export const NavigationLinkLoadingEnhancement = clientEntry(
	'/components/navigation/navigation-link-loading.component.js#NavigationLinkLoadingEnhancement',
	function NavigationLinkLoadingEnhancement(handle) {
		if (typeof document !== 'undefined') {
			const doc = document
			addEventListeners(doc, handle.signal, {
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
					const href = anchor.getAttribute('href')
					if (!href || href.startsWith('#')) return
					if (anchor.hasAttribute('download')) return
					const anchorTarget = anchor.getAttribute('target')
					if (anchorTarget && anchorTarget !== '_self') return

					event.preventDefault()
					anchor.setAttribute('data-loading', '')
					anchor.setAttribute('aria-busy', 'true')
					requestAnimationFrame(() => {
						window.location.assign(anchor.href)
					})
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'navigation-link-loading-enhancement',
			})
	},
)
