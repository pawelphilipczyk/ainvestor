import { addEventListeners, clientEntry, createElement } from 'remix/component'

const DIALOG_ID = 'catalog-etf-dialog'
const ATTR_CLOSE = 'data-catalog-etf-overlay-close'

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

/**
 * Shows `<dialog id="catalog-etf-dialog">` on load when present, closes on backdrop click
 * and syncs with the close link (removes `etf` from the URL).
 */
export const CatalogEtfOverlayEnhancement = clientEntry(
	'/features/catalog/catalog-etf-overlay.component.js#CatalogEtfOverlayEnhancement',
	function CatalogEtfOverlayEnhancement(handle) {
		if (typeof document === 'undefined') {
			return () =>
				createElement('span', {
					hidden: true,
					'aria-hidden': 'true',
					'data-component': 'catalog-etf-overlay-enhancement',
				})
		}

		const doc = document
		const win = doc.defaultView
		if (win == null) {
			return () =>
				createElement('span', {
					hidden: true,
					'aria-hidden': 'true',
					'data-component': 'catalog-etf-overlay-enhancement',
				})
		}
		const dialog = doc.getElementById(DIALOG_ID)
		if (!(dialog instanceof HTMLDialogElement)) {
			return () =>
				createElement('span', {
					hidden: true,
					'aria-hidden': 'true',
					'data-component': 'catalog-etf-overlay-enhancement',
				})
		}

		const openDialog = () => {
			if (dialog.open) return
			const scrollBeforeOpen = win.scrollY
			dialog.showModal()
			requestAnimationFrame(() => {
				win.scrollTo({ top: scrollBeforeOpen, left: 0, behavior: 'instant' })
			})
		}

		const closeDialog = () => {
			if (!dialog.open) return
			dialog.close()
		}

		const onPopState = () => {
			const url = new URL(window.location.href)
			if (url.searchParams.get('etf')) {
				openDialog()
			} else {
				closeDialog()
			}
		}

		if (new URL(window.location.href).searchParams.get('etf')) {
			queueMicrotask(openDialog)
		}

		addEventListeners(dialog, handle.signal, {
			click(event) {
				const target = event.target
				if (!(target instanceof Node)) return
				const panel = dialog.querySelector('[role="document"]')
				if (panel instanceof HTMLElement && panel.contains(target)) return
				event.preventDefault()
				const closeHref = dialog.dataset.catalogEtfCloseHref
				if (closeHref) {
					if (typeof globalThis.navigation?.navigate === 'function') {
						globalThis.navigation.navigate(closeHref)
					} else {
						window.location.assign(closeHref)
					}
				} else {
					closeDialog()
				}
			},
			close() {
				const url = new URL(window.location.href)
				if (url.searchParams.get('etf')) {
					const closeHref = dialog.dataset.catalogEtfCloseHref
					if (closeHref) {
						if (typeof globalThis.navigation?.navigate === 'function') {
							globalThis.navigation.navigate(closeHref)
						} else {
							window.location.assign(closeHref)
						}
					}
				}
			},
		})

		addEventListeners(window, handle.signal, {
			popstate: onPopState,
		})

		addEventListeners(doc, handle.signal, {
			click(event) {
				const target = event.target
				if (!(target instanceof Element)) return
				const anchor = target.closest(`a[${ATTR_CLOSE}]`)
				if (!(anchor instanceof HTMLAnchorElement)) return
				if (isModifiedClick(event)) return
				event.preventDefault()
				const href = anchor.getAttribute('href')
				if (href && !href.startsWith('#')) {
					if (typeof globalThis.navigation?.navigate === 'function') {
						globalThis.navigation.navigate(anchor.href)
					} else {
						window.location.assign(anchor.href)
					}
				} else {
					closeDialog()
				}
			},
		})

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'catalog-etf-overlay-enhancement',
			})
	},
)
