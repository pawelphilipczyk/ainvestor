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
 * Bare specifiers the browser has to resolve, mapped to the package file each
 * one resolves to on disk.
 *
 * Two layers, because two different things do the importing:
 *
 * - `remix/ui*` — imported by our own `.component.js` client entries and by
 *   `entry.js`.
 * - `@remix-run/ui*` — imported by the `remix/ui*` files themselves once the
 *   browser has loaded them (`remix/ui/toggle/primitives` is a one-line
 *   `export *` re-export, and so is every other `remix/ui` subpath).
 *
 * Add a pair here when a client entry starts importing a new `remix/ui`
 * subpath; the Stage 6 primitives adoption in
 * `docs/REMIX_RC_MIGRATION_PLAN.md` is what makes this list grow.
 */
const browserModulePaths = {
	'remix/ui': 'node_modules/remix/dist/ui.js',
	'remix/ui/toggle/primitives':
		'node_modules/remix/dist/ui/toggle/primitives.js',
	'@remix-run/ui': 'node_modules/@remix-run/ui/dist/index.js',
	'@remix-run/ui/toggle/primitives':
		'node_modules/@remix-run/ui/dist/toggle/primitives.js',
} as const

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
const hrefs = await Promise.all(
	Object.values(browserModulePaths).map((filePath) =>
		remixAssetServer.getHref(filePath),
	),
)

export const remixUiImportMap = {
	imports: Object.fromEntries(
		Object.keys(browserModulePaths).map((specifier, index) => [
			specifier,
			hrefs[index],
		]),
	),
}
