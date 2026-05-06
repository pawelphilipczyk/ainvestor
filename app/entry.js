/**
 * Client bootstrap for Remix component runtime.
 * Loaded via <script type="module" src="/entry.js" /> — hydrates all clientEntry components.
 * @see https://github.com/remix-run/remix/tree/main/packages/component
 */
import { run } from 'remix/component'

// startNavigationListener() assumes window.navigation (Chromium). Without it, run() throws
// before hydration on Firefox/Safari; stub is inert for real navigations when links use rmx-document.
if (typeof globalThis !== 'undefined' && globalThis.navigation == null) {
	globalThis.navigation = {
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

run({
	async loadModule(moduleUrl, exportName) {
		const loadedModule = await import(moduleUrl)
		const loaded = loadedModule[exportName]
		if (typeof loaded !== 'function') {
			throw new Error(`Missing export ${exportName} from ${moduleUrl}`)
		}
		return loaded
	},
	async resolveFrame(src, signal) {
		const response = await fetch(src, {
			headers: { Accept: 'text/html' },
			signal,
			credentials: 'same-origin',
		})
		return response.body ?? (await response.text())
	},
})
