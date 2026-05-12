import { addEventListeners, clientEntry, createElement } from 'remix/ui'
import { lockScroll } from 'remix/ui/scroll-lock'

/** Matches Tailwind `md:` (tablet / iPad portrait and up). */
const DESKTOP_MEDIA = '(min-width: 768px)'

function isDesktop(doc) {
	const defaultView = doc.defaultView
	if (!defaultView) return false
	return defaultView.matchMedia(DESKTOP_MEDIA).matches
}

function openSidebar(sidebar, backdrop, sidebarToggle, doc, scrollLockRef) {
	if (isDesktop(doc)) return
	scrollLockRef.release()
	scrollLockRef.release = lockScroll(doc)
	sidebar.classList.remove('-translate-x-full')
	backdrop.classList.remove('opacity-0', 'pointer-events-none')
	backdrop.classList.add('opacity-100')
	sidebarToggle.setAttribute('aria-expanded', 'true')
}

function closeSidebar(sidebar, backdrop, sidebarToggle, doc, scrollLockRef) {
	if (isDesktop(doc)) {
		scrollLockRef.release()
		scrollLockRef.release = () => {}
		return
	}
	resetMobileOverlay(sidebar, backdrop, sidebarToggle, scrollLockRef)
}

function resetMobileOverlay(sidebar, backdrop, sidebarToggle, scrollLockRef) {
	scrollLockRef.release()
	scrollLockRef.release = () => {}
	sidebar.classList.add('-translate-x-full')
	backdrop.classList.add('opacity-0', 'pointer-events-none')
	backdrop.classList.remove('opacity-100')
	sidebarToggle.setAttribute('aria-expanded', 'false')
}

export const SidebarInteractions = clientEntry(
	'/components/layout/sidebar.component.js#SidebarInteractions',
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
				const scrollLockRef = { release: () => {} }
				const desktopMediaQuery = doc.defaultView?.matchMedia(DESKTOP_MEDIA)
				const onBreakpoint = () => {
					if (desktopMediaQuery?.matches) {
						resetMobileOverlay(sidebar, backdrop, sidebarToggle, scrollLockRef)
					}
				}
				desktopMediaQuery?.addEventListener('change', onBreakpoint)

				addEventListeners(doc, handle.signal, {
					click(event) {
						if (isDesktop(doc)) return
						const target = event.target
						if (!(target instanceof Element)) return

						if (target.closest('[data-sidebar-toggle]')) {
							openSidebar(sidebar, backdrop, sidebarToggle, doc, scrollLockRef)
							return
						}

						if (
							target.closest('[data-sidebar-close]') ||
							target.closest('#sidebar-backdrop')
						) {
							closeSidebar(sidebar, backdrop, sidebarToggle, doc, scrollLockRef)
						}
					},
					keydown(event) {
						if (event.key === 'Escape' && !isDesktop(doc)) {
							closeSidebar(sidebar, backdrop, sidebarToggle, doc, scrollLockRef)
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
