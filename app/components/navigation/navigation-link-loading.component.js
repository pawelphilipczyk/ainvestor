import {
	addEventListeners,
	clientEntry,
	createElement,
	navigate,
} from 'remix/ui'

const ATTR = 'data-navigation-loading'

/** Prevents double activation while a navigation is in flight. */
let isNavigating = false

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

function clearAnchorNavigationBusy(anchor) {
	anchor.removeAttribute('data-loading')
	anchor.removeAttribute('aria-busy')
}

function clearNavigationLoadingBusyStateFromDocument(documentObject) {
	for (const element of documentObject.querySelectorAll(
		`a[${ATTR}][data-loading]`,
	)) {
		if (element instanceof HTMLAnchorElement) {
			clearAnchorNavigationBusy(element)
		}
	}
}

/**
 * True when `window.navigation` is the platform Navigation API, not the inert
 * stub from `app/entry.js` (Firefox / older Safari without the API).
 *
 * We cannot use `window.navigation != null` alone: the stub is a non-null plain
 * object, and Remix `navigate()` would call `navigation.navigate()` and resolve
 * without performing a real transition.
 */
function usesNativeNavigationApi() {
	return (
		typeof window !== 'undefined' &&
		typeof Navigation !== 'undefined' &&
		window.navigation != null &&
		window.navigation instanceof Navigation
	)
}

export const NavigationLinkLoadingEnhancement = clientEntry(
	'/components/navigation/navigation-link-loading.component.js#NavigationLinkLoadingEnhancement',
	function NavigationLinkLoadingEnhancement(handle) {
		if (typeof document !== 'undefined') {
			const doc = document
			addEventListeners(window, handle.signal, {
				pageshow(event) {
					if (event.persisted) {
						clearNavigationLoadingBusyStateFromDocument(document)
					}
				},
			})
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

					if (isNavigating) {
						event.preventDefault()
						return
					}

					event.preventDefault()
					anchor.setAttribute('data-loading', '')
					anchor.setAttribute('aria-busy', 'true')

					isNavigating = true
					if (usesNativeNavigationApi()) {
						void (async () => {
							try {
								await navigate(anchor.href, { history: 'push' })
							} catch (err) {
								console.error(
									'[NavigationLinkLoadingEnhancement] navigate() failed; falling back to location.assign',
									{ href: anchor.href, cause: err },
								)
								clearAnchorNavigationBusy(anchor)
								window.location.assign(anchor.href)
							} finally {
								clearAnchorNavigationBusy(anchor)
								isNavigating = false
							}
						})()
					} else {
						try {
							window.location.assign(anchor.href)
						} finally {
							isNavigating = false
						}
					}
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
