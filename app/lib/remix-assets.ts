import { createAssetServer } from 'remix/assets'

/**
 * Serves `remix`'s own browser runtime (and its `@remix-run/ui` dependency)
 * so the document's import map is generated from the installed package
 * version instead of a hand-maintained path literal that drifts across
 * upgrades (see the rc.2 migration: the old literal pointed at a file rc.2
 * had already removed).
 */
export const remixAssetServer = createAssetServer({
	basePath: '/assets',
	allowFiles: [],
	allowPackages: ['remix'],
	// Only the installed `remix`/`@remix-run/ui` package files are served here
	// (not app source): they change on `npm install`, not on live edits, so
	// there is nothing to watch. Also keeps `tsx --test`'s process-isolated
	// test files from each starting a filesystem watcher over `node_modules`.
	watch: false,
})

/**
 * A flat top-level import map, built from `getHref()` rather than
 * `getImportMap()`/`getScriptEntry()`. Those key their mappings to a
 * `scopes` entry for the *importing* module's own served URL, which only
 * resolves for modules the asset server itself serves. Our client
 * `.component.js` files and `entry.js` are served at stable root-relative
 * paths by `staticFiles()` instead (they're already-built plain JS — see
 * `docs/REMIX_RC_MIGRATION_PLAN.md` Stage 5), so a scoped map never applies
 * to them and `remix/ui` would fail to resolve in the browser. Demonstrated
 * against this codebase; Reason 3.
 */
const [remixUiHref, remixRunUiHref] = await Promise.all([
	remixAssetServer.getHref('node_modules/remix/dist/ui.js'),
	remixAssetServer.getHref('node_modules/@remix-run/ui/dist/index.js'),
])

export const remixUiImportMap = {
	imports: {
		'remix/ui': remixUiHref,
		'@remix-run/ui': remixRunUiHref,
	},
}
