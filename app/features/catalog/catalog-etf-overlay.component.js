import { addEventListeners, clientEntry, createElement } from 'remix/component'

const DIALOG_ID = 'catalog-etf-dialog'
const ATTR_CLOSE = 'data-catalog-etf-overlay-close'
const ATTR_INSTANT = 'data-catalog-etf-instant'
const ATTR_OVERLAY_FETCH = 'data-catalog-etf-overlay-fetch'

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

function getDialog(doc) {
	const el = doc.getElementById(DIALOG_ID)
	return el instanceof HTMLDialogElement ? el : null
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
 * Shows `<dialog id="catalog-etf-dialog">`, closes on backdrop click
 * and syncs with the close control (removes `etf` from the URL without full reload).
 * Supports dialogs rendered on the server and dialogs injected after an instant-link fetch.
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

		let bodyScrollLocked = false
		let lockedScrollY = 0

		function lockBodyScroll() {
			if (bodyScrollLocked) return
			bodyScrollLocked = true
			lockedScrollY = win.scrollY || doc.documentElement.scrollTop
			doc.documentElement.style.overflow = 'hidden'
			doc.body.style.overflow = 'hidden'
			doc.body.style.position = 'fixed'
			doc.body.style.top = `-${lockedScrollY}px`
			doc.body.style.left = '0'
			doc.body.style.right = '0'
			doc.body.style.width = '100%'
		}

		function unlockBodyScroll() {
			if (!bodyScrollLocked) return
			bodyScrollLocked = false
			doc.documentElement.style.overflow = ''
			doc.body.style.overflow = ''
			doc.body.style.position = ''
			doc.body.style.top = ''
			doc.body.style.left = ''
			doc.body.style.right = ''
			doc.body.style.width = ''
			win.scrollTo(0, lockedScrollY)
		}

		let overlayFetchInFlight = false

		const wiredDialogs = new WeakSet()

		function openDialog(dialog) {
			if (!(dialog instanceof HTMLDialogElement)) return
			if (dialog.open) return
			lockBodyScroll()
			dialog.showModal()
		}

		function closeDialog(dialog) {
			if (!(dialog instanceof HTMLDialogElement)) return
			if (!dialog.open) return
			dialog.close()
		}

		function wireDialog(dialog) {
			if (wiredDialogs.has(dialog)) return
			wiredDialogs.add(dialog)

			const closeLocal = () => closeDialog(dialog)

			addEventListeners(dialog, handle.signal, {
				click(event) {
					const target = event.target
					if (!(target instanceof Node)) return
					const panel = dialog.querySelector('[role="document"]')
					if (panel instanceof HTMLElement && panel.contains(target)) return
					event.preventDefault()
					replaceCloseUrlAndHide(dialog, closeLocal)
				},
				close() {
					unlockBodyScroll()
					replaceCloseUrlIfEtfParam(dialog)
				},
			})
		}

		function removeExistingDialog() {
			const existing = getDialog(doc)
			if (existing !== null) existing.remove()
		}

		async function openOverlayFromInstantLink(link, fetchUrl) {
			if (overlayFetchInFlight) return
			let destination
			try {
				destination = new URL(link.href)
			} catch {
				return
			}
			if (destination.origin !== win.location.origin) {
				win.location.assign(link.href)
				return
			}

			overlayFetchInFlight = true
			try {
				win.history.pushState(
					win.history.state,
					'',
					`${destination.pathname}${destination.search}${destination.hash}`,
				)

				removeExistingDialog()

				const response = await fetch(fetchUrl, {
					credentials: 'same-origin',
					headers: { Accept: 'text/html' },
					signal: handle.signal,
				})

				if (!response.ok) {
					win.location.assign(link.href)
					return
				}

				const html = await response.text()
				doc.body.insertAdjacentHTML('beforeend', html)

				const dialog = getDialog(doc)
				if (dialog === null) {
					win.location.assign(link.href)
					return
				}

				wireDialog(dialog)
				openDialog(dialog)
			} catch {
				win.location.assign(link.href)
			} finally {
				overlayFetchInFlight = false
			}
		}

		const initialDialog = getDialog(doc)
		if (initialDialog !== null) {
			wireDialog(initialDialog)
			if (new URL(win.location.href).searchParams.get('etf')) {
				openDialog(initialDialog)
			}
		}

		const onPopState = () => {
			const url = new URL(win.location.href)
			const dialog = getDialog(doc)
			if (url.searchParams.get('etf')) {
				if (dialog === null) {
					win.location.reload()
					return
				}
				wireDialog(dialog)
				openDialog(dialog)
			} else if (dialog !== null) {
				closeDialog(dialog)
			}
		}

		addEventListeners(win, handle.signal, {
			popstate: onPopState,
		})

		addEventListeners(doc, handle.signal, {
			click(event) {
				const target = event.target
				if (!(target instanceof Element)) return

				const instantLink = target.closest(`a[${ATTR_INSTANT}]`)
				if (instantLink instanceof HTMLAnchorElement) {
					const fetchUrl = instantLink.getAttribute(ATTR_OVERLAY_FETCH)
					if (
						fetchUrl !== null &&
						fetchUrl.length > 0 &&
						!isModifiedClick(event)
					) {
						event.preventDefault()
						event.stopPropagation()
						void openOverlayFromInstantLink(instantLink, fetchUrl)
						return
					}
				}

				const control = target.closest(`[${ATTR_CLOSE}]`)
				if (!(control instanceof HTMLElement)) return
				if (isModifiedClick(event)) return
				event.preventDefault()
				const dialog = getDialog(doc)
				if (dialog === null) return
				replaceCloseUrlAndHide(dialog, () => closeDialog(dialog))
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
