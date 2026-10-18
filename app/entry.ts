/**
 * Client bootstrap for Remix UI runtime.
 * Loaded via the module script the document shell renders, from the URL the
 * asset server gives `app/entry.ts` — hydrates all clientEntry components.
 * @see https://github.com/remix-run/remix/tree/main/packages/ui
 */
import { run } from 'remix/component'

// startNavigationListener() assumes window.navigation (Chromium). Without it, run() throws
// before hydration on Firefox/Safari; stub is inert for real navigations when links use rmx-document.
// The DOM types say it is always there; on an older browser it is not, hence the loose view.
const scope = globalThis as { navigation?: unknown }
if (scope.navigation == null) {
	scope.navigation = {
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
