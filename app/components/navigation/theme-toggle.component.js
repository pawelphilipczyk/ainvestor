import { addEventListeners, clientEntry, createElement } from 'remix/component'

function toggleTheme(doc) {
	const isDark = doc.documentElement.classList.toggle('dark')
	doc.defaultView?.localStorage.setItem('theme', isDark ? 'dark' : 'light')
}

export const ThemeToggleInteractions = clientEntry(
	'/components/navigation/theme-toggle.component.js#ThemeToggleInteractions',
	function ThemeToggleInteractions(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					if (!target.closest('[data-theme-toggle]')) return

					toggleTheme(document)
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'theme-toggle-interactions',
			})
	},
)
