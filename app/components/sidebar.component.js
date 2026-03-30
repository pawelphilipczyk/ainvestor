import { addEventListeners, clientEntry, createElement } from 'remix/component'

/** Matches Tailwind `md:` (tablet / iPad portrait and up). */
const DESKTOP_MEDIA = '(min-width: 768px)'

function isDesktop(doc) {
	const defaultView = doc.defaultView
	if (!defaultView) return false
	return defaultView.matchMedia(DESKTOP_MEDIA).matches
}

function openSidebar(sidebar, backdrop, sidebarToggle, doc) {
	if (isDesktop(doc)) return
	sidebar.classList.remove('-translate-x-full')
	backdrop.classList.remove('opacity-0', 'pointer-events-none')
	backdrop.classList.add('opacity-100')
	sidebarToggle.setAttribute('aria-expanded', 'true')
	doc.body.style.overflow = 'hidden'
}

function closeSidebar(sidebar, backdrop, sidebarToggle, doc) {
	if (isDesktop(doc)) {
		doc.body.style.overflow = ''
		return
	}
	resetMobileOverlay(sidebar, backdrop, sidebarToggle, doc)
}

function resetMobileOverlay(sidebar, backdrop, sidebarToggle, doc) {
	sidebar.classList.add('-translate-x-full')
	backdrop.classList.add('opacity-0', 'pointer-events-none')
	backdrop.classList.remove('opacity-100')
	sidebarToggle.setAttribute('aria-expanded', 'false')
	doc.body.style.overflow = ''
}

export const SidebarInteractions = clientEntry(
	'/components/sidebar.component.js#SidebarInteractions',
	function SidebarInteractions() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'sidebar-interactions',
				connect: (node, signal) => {
					const doc = node.ownerDocument
					const win = doc.defaultView
					if (!win) return

					const sidebar = doc.querySelector('#app-sidebar')
					const backdrop = doc.querySelector('#sidebar-backdrop')
					const sidebarToggle = doc.querySelector('[data-sidebar-toggle]')
					const closeButton = doc.querySelector('[data-sidebar-close]')
					if (
						!(sidebar instanceof HTMLElement) ||
						!(backdrop instanceof HTMLElement) ||
						!(sidebarToggle instanceof HTMLElement)
					) {
						return
					}

					const desktopMediaQuery = win.matchMedia(DESKTOP_MEDIA)
					const onBreakpoint = () => {
						if (desktopMediaQuery.matches) {
							resetMobileOverlay(sidebar, backdrop, sidebarToggle, doc)
						}
					}
					desktopMediaQuery.addEventListener('change', onBreakpoint)

					const openIfMobile = () => {
						openSidebar(sidebar, backdrop, sidebarToggle, doc)
					}
					const closeIfMobile = () => {
						closeSidebar(sidebar, backdrop, sidebarToggle, doc)
					}

					// Bind directly on controls so opens are not lost to stopPropagation
					// or other document-level handlers (document delegation is fragile here).
					sidebarToggle.addEventListener(
						'click',
						(event) => {
							if (isDesktop(doc)) return
							event.preventDefault()
							openIfMobile()
						},
						{ signal },
					)

					if (closeButton instanceof HTMLElement) {
						closeButton.addEventListener('click', closeIfMobile, { signal })
					}

					backdrop.addEventListener('click', closeIfMobile, { signal })

					addEventListeners(doc, signal, {
						keydown(event) {
							if (event.key === 'Escape' && !isDesktop(doc)) {
								closeIfMobile()
							}
						},
					})

					signal.addEventListener(
						'abort',
						() => {
							desktopMediaQuery.removeEventListener('change', onBreakpoint)
						},
						{ once: true },
					)
				},
			})
	},
)
