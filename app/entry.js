/**
 * Client bootstrap for Remix component runtime.
 * Loaded via <script type="module" src="/entry.js" /> — hydrates all clientEntry components.
 * @see https://github.com/remix-run/remix/tree/main/packages/component
 */
import { run } from 'remix/component'

// Firefox and other browsers without the Navigation API leave `window.navigation`
// undefined; @remix-run/component's run() calls startNavigationListener which
// touches it unguarded and throws, so hydration never runs (sidebar, theme, etc.).
if (typeof globalThis !== 'undefined') {
	const g = globalThis
	if (g.navigation == null) {
		g.navigation = {
			updateCurrentEntry() {},
			addEventListener() {},
			navigate() {
				return { finished: Promise.resolve() }
			},
			entries() {
				return []
			},
		}
	}
}

run({
	async loadModule(moduleUrl, exportName) {
		const loadedModule = await import(moduleUrl)
		const loaded = loadedModule[exportName]
		if (typeof loaded !== 'function') {
			throw new Error(`Missing export ${exportName} from ${moduleUrl}`)
		}
		return loaded
	},
})
