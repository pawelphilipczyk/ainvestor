import { clientEntry, createElement } from 'remix/ui'
import { addEventListeners } from '../../lib/browser/event-listeners.ts'
import { lockScroll } from '../../lib/browser/scroll-lock.ts'

/** Matches Tailwind `md:` (tablet / iPad portrait and up). */
const DESKTOP_MEDIA = '(min-width: 768px)'

/**
 * The live scroll-lock hold, boxed so the helpers below can swap it.
 *
 * `release` is the disposer `lockScroll()` returned, or a no-op when nothing
 * is held.
 */
type ScrollLockRef = { release: () => void }

/**
 * Everything the overlay helpers act on, resolved once when the entry mounts.
 *
 * One parameter rather than five positional ones, per AGENTS.md's signature
 * rule: every call site passed the same bundle in the same order, which is
 * exactly the argument-transposition bug that rule exists to prevent — all
 * three elements are `HTMLElement`, so swapping two of them type-checks.
 */
type SidebarOverlay = {
	sidebar: HTMLElement
	backdrop: HTMLElement
	sidebarToggle: HTMLElement
	doc: Document
	scrollLockRef: ScrollLockRef
}

function isDesktop(doc: Document) {
	const defaultView = doc.defaultView
	if (!defaultView) return false
	return defaultView.matchMedia(DESKTOP_MEDIA).matches
}

function openSidebar(overlay: SidebarOverlay) {
	const { sidebar, backdrop, sidebarToggle, doc, scrollLockRef } = overlay
	if (isDesktop(doc)) return
	scrollLockRef.release()
	scrollLockRef.release = lockScroll(doc)
	sidebar.classList.remove('-translate-x-full')
	backdrop.classList.remove('opacity-0', 'pointer-events-none')
	backdrop.classList.add('opacity-100')
	sidebarToggle.setAttribute('aria-expanded', 'true')
}

function closeSidebar(overlay: SidebarOverlay) {
	const { doc, scrollLockRef } = overlay
	if (isDesktop(doc)) {
		scrollLockRef.release()
		scrollLockRef.release = () => {}
		return
	}
	resetMobileOverlay(overlay)
}

function resetMobileOverlay(overlay: SidebarOverlay) {
	const { sidebar, backdrop, sidebarToggle, scrollLockRef } = overlay
	scrollLockRef.release()
	scrollLockRef.release = () => {}
	sidebar.classList.add('-translate-x-full')
	backdrop.classList.add('opacity-0', 'pointer-events-none')
	backdrop.classList.remove('opacity-100')
	sidebarToggle.setAttribute('aria-expanded', 'false')
}

export const SidebarInteractions = clientEntry(
	`${import.meta.url}#SidebarInteractions`,
	function SidebarInteractions(handle) {
		if (typeof document !== 'undefined') {
			const doc = document
			const sidebar = doc.querySelector('#app-sidebar')
			const backdrop = doc.querySelector('#sidebar-backdrop')
			const sidebarToggle = doc.querySelector('[data-sidebar-toggle]')
			if (
				sidebar instanceof HTMLElement &&
				backdrop instanceof HTMLElement &&
				sidebarToggle instanceof HTMLElement
			) {
				const scrollLockRef: ScrollLockRef = { release: () => {} }
				const overlay: SidebarOverlay = {
					sidebar,
					backdrop,
					sidebarToggle,
					doc,
					scrollLockRef,
				}
				const desktopMediaQuery = doc.defaultView?.matchMedia(DESKTOP_MEDIA)
				const onBreakpoint = () => {
					if (desktopMediaQuery?.matches) {
						resetMobileOverlay(overlay)
					}
				}
				desktopMediaQuery?.addEventListener('change', onBreakpoint)

				addEventListeners(doc, handle.signal, {
					click(event) {
						if (isDesktop(doc)) return
						const target = event.target
						if (!(target instanceof Element)) return

						if (target.closest('[data-sidebar-toggle]')) {
							openSidebar(overlay)
							return
						}

						if (
							target.closest('[data-sidebar-close]') ||
							target.closest('#sidebar-backdrop')
						) {
							closeSidebar(overlay)
						}
					},
					keydown(event) {
						if (event.key === 'Escape' && !isDesktop(doc)) {
							closeSidebar(overlay)
						}
					},
				})

				handle.signal.addEventListener(
					'abort',
					() => {
						scrollLockRef.release()
						scrollLockRef.release = () => {}
						desktopMediaQuery?.removeEventListener('change', onBreakpoint)
					},
					{ once: true },
				)
			}
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'sidebar-interactions',
			})
	},
)
