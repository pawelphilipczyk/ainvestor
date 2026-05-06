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
 * Drop `?etf=` from the URL without reloading, then close the dialog (instant UX).
 * Falls back to full navigation only if `closeHref` is off-origin or invalid.
 */
function replaceCloseUrlAndHide(dialog, closeDialog) {
	const closeHref = dialog.dataset.catalogEtfCloseHref
	if (!closeHref) {
		closeDialog()
		return
	}
	try {
		const resolved = new URL(closeHref, window.location.href)
		if (resolved.origin === window.location.origin) {
			const next = `${resolved.pathname}${resolved.search}${resolved.hash}`
			window.history.replaceState(window.history.state, '', next)
			closeDialog()
			return
		}
	} catch {
		// fall through
	}
	window.location.assign(closeHref)
}

/**
 * URL still has `etf` but the dialog was dismissed (e.g. Escape) — sync the address bar only.
 */
function replaceCloseUrlIfEtfParam(dialog) {
	const url = new URL(window.location.href)
	if (!url.searchParams.get('etf')) return
	const closeHref = dialog.dataset.catalogEtfCloseHref
	if (!closeHref) return
	try {
		const resolved = new URL(closeHref, window.location.href)
		if (resolved.origin === window.location.origin) {
			const next = `${resolved.pathname}${resolved.search}${resolved.hash}`
			window.history.replaceState(window.history.state, '', next)
			return
		}
	} catch {
		// fall through
	}
	window.location.assign(closeHref)
}

/**
 * Shows `<dialog id="catalog-etf-dialog">` on load when present, closes on backdrop click
 * and syncs with the close control (removes `etf` from the URL without full reload).
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
			openDialog()
		}

		addEventListeners(dialog, handle.signal, {
			click(event) {
				const target = event.target
				if (!(target instanceof Node)) return
				const panel = dialog.querySelector('[role="document"]')
				if (panel instanceof HTMLElement && panel.contains(target)) return
				event.preventDefault()
				replaceCloseUrlAndHide(dialog, closeDialog)
			},
			close() {
				replaceCloseUrlIfEtfParam(dialog)
			},
		})

		addEventListeners(window, handle.signal, {
			popstate: onPopState,
		})

		addEventListeners(doc, handle.signal, {
			click(event) {
				const target = event.target
				if (!(target instanceof Element)) return
				const control = target.closest(`[${ATTR_CLOSE}]`)
				if (!(control instanceof HTMLElement)) return
				if (isModifiedClick(event)) return
				event.preventDefault()
				replaceCloseUrlAndHide(dialog, closeDialog)
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
