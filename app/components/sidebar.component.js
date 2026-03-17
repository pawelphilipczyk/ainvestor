import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

function openSidebar(sidebar, backdrop, sidebarToggle, doc) {
	sidebar.classList.remove('-translate-x-full')
	backdrop.classList.remove('opacity-0', 'pointer-events-none')
	backdrop.classList.add('opacity-100')
	sidebarToggle.setAttribute('aria-expanded', 'true')
	doc.body.style.overflow = 'hidden'
}

function closeSidebar(sidebar, backdrop, sidebarToggle, doc) {
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
					const sidebar = doc.querySelector('#app-sidebar')
					const backdrop = doc.querySelector('#sidebar-backdrop')
					const sidebarToggle = doc.querySelector('[data-sidebar-toggle]')
					if (
						!(sidebar instanceof HTMLElement) ||
						!(backdrop instanceof HTMLElement) ||
						!(sidebarToggle instanceof HTMLElement)
					) {
						return
					}

					const dispose = on(doc, {
						click(event) {
							const target = event.target
							if (!(target instanceof Element)) return

							if (target.closest('[data-sidebar-toggle]')) {
								openSidebar(sidebar, backdrop, sidebarToggle, doc)
								return
							}

							if (
								target.closest('[data-sidebar-close]') ||
								target.closest('#sidebar-backdrop')
							) {
								closeSidebar(sidebar, backdrop, sidebarToggle, doc)
							}
						},
						keydown(event) {
							if (event.key === 'Escape') {
								closeSidebar(sidebar, backdrop, sidebarToggle, doc)
							}
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
