import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

export const ThemeToggleInteractions = clientEntry(
	'/components/theme-toggle.component.js#ThemeToggleInteractions',
	function ThemeToggleInteractions() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'theme-toggle-interactions',
				connect: (_node, signal) => {
					if (typeof document === 'undefined') return
					const dispose = on(document, {
						click(event) {
							const target = event.target
							if (!(target instanceof Element)) return
							if (!target.closest('[data-theme-toggle]')) return

							const isDark = document.documentElement.classList.toggle('dark')
							localStorage.setItem('theme', isDark ? 'dark' : 'light')
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
