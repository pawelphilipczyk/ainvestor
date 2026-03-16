function toggleTheme() {
	const isDark = document.documentElement.classList.toggle('dark')
	localStorage.setItem('theme', isDark ? 'dark' : 'light')
}

export async function mount(el) {
	try {
		const { on } = await import('remix/interaction')
		on(el, { click: toggleTheme })
	} catch {
		el.addEventListener('click', toggleTheme)
	}
}
