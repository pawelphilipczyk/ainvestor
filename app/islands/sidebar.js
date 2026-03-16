export function mount() {
	const sidebarToggle = document.querySelector('[data-sidebar-toggle]')
	const sidebarClose = document.querySelector('[data-sidebar-close]')
	const sidebar = document.getElementById('app-sidebar')
	const backdrop = document.getElementById('sidebar-backdrop')

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

	if (sidebarToggle) sidebarToggle.addEventListener('click', openSidebar)
	if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar)
	if (backdrop) backdrop.addEventListener('click', closeSidebar)
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeSidebar()
	})
}
