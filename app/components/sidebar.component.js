import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

function openSidebar() {
	const sidebar = document.querySelector('#app-sidebar')
	const backdrop = document.querySelector('#sidebar-backdrop')
	const sidebarToggle = document.querySelector('[data-sidebar-toggle]')
	if (!(sidebar instanceof HTMLElement) || !(backdrop instanceof HTMLElement)) {
		return
	}

	sidebar.classList.remove('-translate-x-full')
	backdrop.classList.remove('opacity-0', 'pointer-events-none')
	backdrop.classList.add('opacity-100')
	sidebarToggle?.setAttribute('aria-expanded', 'true')
	document.body.style.overflow = 'hidden'
}

function closeSidebar() {
	const sidebar = document.querySelector('#app-sidebar')
	const backdrop = document.querySelector('#sidebar-backdrop')
	const sidebarToggle = document.querySelector('[data-sidebar-toggle]')
	if (!(sidebar instanceof HTMLElement) || !(backdrop instanceof HTMLElement)) {
		return
	}

	sidebar.classList.add('-translate-x-full')
	backdrop.classList.add('opacity-0', 'pointer-events-none')
	backdrop.classList.remove('opacity-100')
	sidebarToggle?.setAttribute('aria-expanded', 'false')
	document.body.style.overflow = ''
}

export const SidebarInteractions = clientEntry(
	'/components/sidebar.component.js#SidebarInteractions',
	function SidebarInteractions() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'sidebar-interactions',
				connect: (_node, signal) => {
					if (typeof document === 'undefined') return
					const dispose = on(document, {
						click(event) {
							const target = event.target
							if (!(target instanceof Element)) return

							if (target.closest('[data-sidebar-toggle]')) {
								openSidebar()
								return
							}

							if (
								target.closest('[data-sidebar-close]') ||
								target.closest('#sidebar-backdrop')
							) {
								closeSidebar()
							}
						},
						keydown(event) {
							if (event.key === 'Escape') closeSidebar()
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
