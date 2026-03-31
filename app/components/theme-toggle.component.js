import { on } from '@remix-run/interaction'
import { clientEntry, createElement } from 'remix/component'

function toggleTheme(doc) {
	const isDark = doc.documentElement.classList.toggle('dark')
	doc.defaultView?.localStorage.setItem('theme', isDark ? 'dark' : 'light')
}

export const ThemeToggleInteractions = clientEntry(
	'/components/theme-toggle.component.js#ThemeToggleInteractions',
	function ThemeToggleInteractions() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'theme-toggle-interactions',
				connect: (node, signal) => {
					const doc = node.ownerDocument
					const dispose = on(doc, {
						click(event) {
							const target = event.target
							if (!(target instanceof Element)) return
							if (!target.closest('[data-theme-toggle]')) return

							toggleTheme(doc)
						},
					})
					signal.addEventListener('abort', dispose, { once: true })
				},
			})
	},
)
