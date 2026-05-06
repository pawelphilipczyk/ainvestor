/**
 * ETF modal overlay: registers synchronously from entry.js (before Remix run())
 * so instant links never fall through to full-page navigation.
 *
 * Optional bootstrap (document-shell): sets window.__catalogEtfInstantPending when
 * the user clicks before this module loads.
 */

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

let installed = false

export function installCatalogEtfOverlay() {
	if (typeof document === 'undefined') return
	if (installed) return
	installed = true

	globalThis.__catalogEtfOverlayInstalled = true

	const doc = document
	const win = doc.defaultView
	if (win == null) return

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

		dialog.addEventListener('click', function onDialogBackdropClick(event) {
			const target = event.target
			if (!(target instanceof Node)) return
			const panel = dialog.querySelector('[role="document"]')
			if (panel instanceof HTMLElement && panel.contains(target)) return
			event.preventDefault()
			replaceCloseUrlAndHide(dialog, closeLocal)
		})

		dialog.addEventListener('close', function onDialogClose() {
			unlockBodyScroll()
			replaceCloseUrlIfEtfParam(dialog)
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
			})

			if (!response.ok) {
				win.location.assign(link.href)
				return
			}

			const html = await response.text()
			doc.body.insertAdjacentHTML('beforeend', html)

			const dialogEl = getDialog(doc)
			if (dialogEl === null) {
				win.location.assign(link.href)
				return
			}

			wireDialog(dialogEl)
			openDialog(dialogEl)
		} catch {
			win.location.assign(link.href)
		} finally {
			overlayFetchInFlight = false
		}
	}

	function onDocumentClickCapture(event) {
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
				event.stopImmediatePropagation()
				void openOverlayFromInstantLink(instantLink, fetchUrl)
				return
			}
		}

		const control = target.closest(`[${ATTR_CLOSE}]`)
		if (!(control instanceof HTMLElement)) return
		if (isModifiedClick(event)) return
		event.preventDefault()
		event.stopImmediatePropagation()
		const dialogEl = getDialog(doc)
		if (dialogEl === null) return
		replaceCloseUrlAndHide(dialogEl, () => closeDialog(dialogEl))
	}

	doc.addEventListener('click', onDocumentClickCapture, { capture: true })

	win.addEventListener('popstate', function onPopState() {
		const url = new URL(win.location.href)
		const dialogEl = getDialog(doc)
		if (url.searchParams.get('etf')) {
			if (dialogEl === null) {
				win.location.reload()
				return
			}
			wireDialog(dialogEl)
			openDialog(dialogEl)
		} else if (dialogEl !== null) {
			closeDialog(dialogEl)
		}
	})

	const initialDialog = getDialog(doc)
	if (initialDialog !== null) {
		wireDialog(initialDialog)
		if (new URL(win.location.href).searchParams.get('etf')) {
			openDialog(initialDialog)
		}
	}

	const pending = globalThis.__catalogEtfInstantPending
	if (
		pending &&
		typeof pending === 'object' &&
		pending.anchor instanceof HTMLAnchorElement &&
		typeof pending.fetchUrl === 'string' &&
		pending.fetchUrl.length > 0
	) {
		delete globalThis.__catalogEtfInstantPending
		void openOverlayFromInstantLink(pending.anchor, pending.fetchUrl)
	}
}
