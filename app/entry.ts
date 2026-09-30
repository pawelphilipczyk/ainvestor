/**
 * Client bootstrap for Remix UI runtime.
 * Loaded via the module script the document shell renders, from the URL the
 * asset server gives `app/entry.ts` — hydrates all clientEntry components.
 * @see https://github.com/remix-run/remix/tree/main/packages/ui
 */
import { run } from 'remix/ui'

declare global {
	/**
	 * The Navigation API, which TypeScript's DOM lib does not declare.
	 *
	 * Deliberately `unknown` rather than a hand-written interface: in Chromium
	 * this is the real platform object, and the only thing this file asks of it
	 * is whether it is absent. Declaring a shape here would describe the stub
	 * below accurately and the browser's own object falsely.
	 */
	var navigation: unknown
}

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
})
