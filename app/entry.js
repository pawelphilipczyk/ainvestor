/**
 * Client bootstrap for Remix component runtime.
 * Loaded via <script type="module" src="/entry.js" /> — hydrates all clientEntry components.
 * @see https://github.com/remix-run/remix/tree/main/packages/component
 */
import { run } from 'remix/component'

run(document, {
	async loadModule(moduleUrl, exportName) {
		const mod = await import(moduleUrl)
		const loaded = mod[exportName]
		if (typeof loaded !== 'function') {
			throw new Error(`Missing export ${exportName} from ${moduleUrl}`)
		}
		return loaded
	},
})
