function bindClick(target, handler, on) {
	if (!target) return
	if (on) {
		on(target, { click: handler })
		return
	}
	target.addEventListener('click', handler)
}

export async function mount(el) {
	const sidebarToggle = el.querySelector('[data-sidebar-toggle]')
	const sidebarClose = el.querySelector('[data-sidebar-close]')
	const sidebar = el.querySelector('#app-sidebar')
	const backdrop = el.querySelector('#sidebar-backdrop')
	let on = null

	function openSidebar() {
		sidebar.classList.remove('-translate-x-full')
		backdrop.classList.remove('opacity-0', 'pointer-events-none')
		backdrop.classList.add('opacity-100')
		sidebarToggle?.setAttribute('aria-expanded', 'true')
		document.body.style.overflow = 'hidden'
	}

	function closeSidebar() {
		sidebar.classList.add('-translate-x-full')
		backdrop.classList.add('opacity-0', 'pointer-events-none')
		backdrop.classList.remove('opacity-100')
		sidebarToggle?.setAttribute('aria-expanded', 'false')
		document.body.style.overflow = ''
	}

	try {
		;({ on } = await import('remix/interaction'))
	} catch {
		// Keep native listeners as a no-build fallback.
	}

	bindClick(sidebarToggle, openSidebar, on)
	bindClick(sidebarClose, closeSidebar, on)
	bindClick(backdrop, closeSidebar, on)
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeSidebar()
	})
}
