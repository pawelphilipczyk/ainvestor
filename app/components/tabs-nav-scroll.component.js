import { on } from '@remix-run/interaction'
import { clientEntry, createElement } from 'remix/component'

const STORAGE_PREFIX = 'windowScroll:tab:'

function scrollStorageKey(groupId, tabKey) {
	return `${STORAGE_PREFIX}${groupId}:${tabKey}`
}

/** One-shot flag: next load of this tab should apply {@link scrollStorageKey} Y. */
function pendingRestoreStorageKey(groupId, tabKey) {
	return `${STORAGE_PREFIX}pending:${groupId}:${tabKey}`
}

function readStoredScrollY(key) {
	try {
		const raw = sessionStorage.getItem(key)
		if (raw === null) return null
		const y = Number.parseInt(raw, 10)
		return Number.isFinite(y) && y >= 0 ? y : null
	} catch {
		return null
	}
}

/**
 * Persists window scroll for the active tab. When `destinationTabKey` is set
 * (tab click to another tab), also sets a one-shot pending token so the next
 * page only restores scroll for that destination tab.
 */
function saveScrollForCurrentTab(doc, win, destinationTabKey) {
	const nav = doc.querySelector('[data-tab-scroll-group]')
	const groupId = nav?.getAttribute('data-tab-scroll-group')
	if (!groupId) return
	const active = nav.querySelector(
		'a[aria-current="page"][data-tab-scroll-key]',
	)
	const tabKey = active?.getAttribute('data-tab-scroll-key')
	if (!tabKey) return
	try {
		sessionStorage.setItem(
			scrollStorageKey(groupId, tabKey),
			String(Math.round(win.scrollY)),
		)
		if (destinationTabKey) {
			sessionStorage.setItem(
				pendingRestoreStorageKey(groupId, destinationTabKey),
				'1',
			)
		}
	} catch {
		// private mode / quota
	}
}

function restoreScrollForCurrentTab(doc, win) {
	const nav = doc.querySelector('[data-tab-scroll-group]')
	const groupId = nav?.getAttribute('data-tab-scroll-group')
	if (!groupId) return
	const active = nav.querySelector(
		'a[aria-current="page"][data-tab-scroll-key]',
	)
	const tabKey = active?.getAttribute('data-tab-scroll-key')
	if (!tabKey) return
	const pendingKey = pendingRestoreStorageKey(groupId, tabKey)
	try {
		if (sessionStorage.getItem(pendingKey) === null) return
		sessionStorage.removeItem(pendingKey)
	} catch {
		return
	}
	const y = readStoredScrollY(scrollStorageKey(groupId, tabKey))
	if (y === null) return
	const apply = () => {
		win.scrollTo(0, y)
	}
	if (doc.readyState === 'complete') {
		requestAnimationFrame(apply)
		return
	}
	win.addEventListener('load', () => requestAnimationFrame(apply), {
		once: true,
	})
}

export const TabsNavScrollRestoration = clientEntry(
	'/components/tabs-nav-scroll.component.js#TabsNavScrollRestoration',
	function TabsNavScrollRestoration() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'tabs-nav-scroll-restoration',
				connect: (node, signal) => {
					const doc = node.ownerDocument
					const win = doc.defaultView
					if (!win) return

					restoreScrollForCurrentTab(doc, win)

					const dispose = on(doc, {
						click(event) {
							if (!(event.target instanceof Element)) return
							const link = event.target.closest('a[data-tab-scroll-key][href]')
							if (!(link instanceof HTMLAnchorElement)) return
							const nav = link.closest('[data-tab-scroll-group]')
							if (!nav) return
							if (link.getAttribute('aria-current') === 'page') return
							const destinationTabKey = link.getAttribute('data-tab-scroll-key')
							if (!destinationTabKey) return
							saveScrollForCurrentTab(doc, win, destinationTabKey)
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
