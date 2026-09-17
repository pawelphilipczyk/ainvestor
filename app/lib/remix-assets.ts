import * as path from 'node:path'
import { createAssetServer } from 'remix/assets'
import type { RenderToStreamOptions } from 'remix/ui/server'
import { uiHmr } from 'remix/ui-hmr/assets'

const rootDir = path.resolve(import.meta.dirname, '..', '..')

/**
 * Whether this process can serve browser HMR.
 *
 * `hmr.ts` (`remix/node-hmr`) sets `REMIX_NODE_HMR=1` in the child it
 * supervises, and it owns the EventSource server the browser client connects
 * to — so only that child can open a channel. `npm start`, `node --test` and a
 * bare `node server.ts` all run without it and get a plain asset server.
 */
const browserHmrAvailable = process.env.REMIX_NODE_HMR === '1'

/**
 * `remix/node-hmr/runtime`, or `null` when this process is not really
 * supervised by `node-hmr`.
 *
 * `REMIX_NODE_HMR=1` is an ordinary environment variable, so it is inherited
 * by any child process and can be set by hand, while the `node-hmr` export
 * condition that makes this module importable does not travel with it. That
 * mismatch is not hypothetical and not survivable unguarded: the import
 * throws, and the rejection killed the server moments after it logged that it
 * was running. Measured, with `REMIX_NODE_HMR=1 node server.ts`.
 *
 * Cached so both call sites — the asset server's channel factory and
 * `server.ts`'s ready signal — share one import and one warning.
 */
let nodeHmrRuntime:
	| Promise<typeof import('remix/node-hmr/runtime') | null>
	| undefined

export function loadNodeHmrRuntime(): Promise<
	typeof import('remix/node-hmr/runtime') | null
> {
	nodeHmrRuntime ??= import('remix/node-hmr/runtime').catch(() => {
		console.warn(
			'[hmr] REMIX_NODE_HMR is set but node-hmr is not supervising this process. Browser HMR is off; run `npm run dev` to enable it.',
		)
		return null
	})
	return nodeHmrRuntime
}

/**
 * Whether to watch source files for changes.
 *
 * Derived from {@link browserHmrAvailable} rather than set beside it: the
 * asset server rejects `hmr` without `watch`, and deriving it means no future
 * edit can turn one on and leave the other off.
 */
const watchSources =
	browserHmrAvailable || process.env.NODE_ENV === 'development'

/** Absolute path of a repo file, the form `remixAssetServer` takes. */
function assetSourcePath(relativePath: string): string {
	return path.join(rootDir, relativePath)
}

/**
 * Serves every browser module this app ships: its own client entries
 * (`app/**\/*.component.{ts,js}`, their `app/lib/browser/*.ts` helpers,
 * `app/entry.js`) and the `remix`/`@remix-run/ui` package files they import.
 *
 * Nothing here is a hand-maintained path literal. The document's import map,
 * the bootstrap `<script src>` and every client entry's `href` are all derived
 * from the installed package version and the files on disk, so none of them
 * can drift across an upgrade — the failure the rc.2 migration hit with the
 * old literal, which pointed at a file rc.2 had already removed.
 *
 * `allowFiles` is the security boundary, and it is deliberately narrow now
 * that TypeScript is served: the `.component.` infix and the `lib/browser/`
 * directory are what separate a browser module from a server-only one, not the
 * file extension. `app/**\/*.ts` would expose `session.ts`, `gist.ts` and every
 * other server module; `app/lib/*.js` (which this replaced) would have served
 * any stray `.js` later dropped into `app/lib`. Anything reachable here is
 * public — check that before widening a glob, and see
 * `docs/REMIX_ASSETS_MIGRATION_PLAN.md` Stage 4.
 */
export const remixAssetServer = createAssetServer({
	basePath: '/assets',
	rootDir,
	allowFiles: [
		'app/entry.js',
		'app/**/*.component.ts',
		'app/**/*.component.js',
		'app/lib/browser/*.ts',
	],
	allowPackages: ['remix'],
	// Instrument component modules so an edit can be applied to an open tab
	// instead of reloading it. Only under HMR: the transform exists to add
	// `import.meta.hot` boundaries, which nothing consumes otherwise.
	scripts: browserHmrAvailable ? { loaders: [uiHmr()] } : undefined,
	// The browser HMR channel. `remix/node-hmr/runtime` throws if imported by
	// a process `node-hmr` is not supervising, hence the dynamic import behind
	// the flag rather than a top-level one — `server.ts` is the same entry
	// module under `npm start`, where that import would fail.
	hmr: browserHmrAvailable
		? async () => {
				// Returning `undefined` leaves HMR inactive, which is the right
				// outcome when the flag is set without real supervision.
				const runtime = await loadNodeHmrRuntime()
				return runtime?.createBrowserHmrChannel()
			}
		: undefined,
	// Watching is what keeps development honest, with or without HMR: this
	// server caches each module's *compiled* output, where `staticFiles()`
	// used to read the file per request, so without a watcher an edit is
	// served stale. `hmr.ts` alone does not save us — `remix/ui-hmr/node`
	// hot-swaps a `.component.js` edit in place, with no process restart to
	// rebuild this cache with it (measured). Off everywhere else, so
	// `node --test`'s process-isolated test files do not each start a
	// filesystem watcher, and so production never pays for one. Stage 3's
	// `fingerprint` also requires it off; see
	// `docs/REMIX_ASSETS_MIGRATION_PLAN.md`.
	watch: watchSources ? { ignore: ['**/node_modules/**'] } : false,
})

/**
 * Served URL of one repo file, e.g. `assetHref('app/entry.js')`.
 *
 * The one way to name a browser module's URL. Nothing should hard-code an
 * `/assets/...` path: the mount layout and any future fingerprinting are the
 * asset server's to decide.
 */
export function assetHref(relativePath: string): Promise<string> {
	return remixAssetServer.getHref(assetSourcePath(relativePath))
}

/**
 * The browser bootstrap: `app/entry.js`'s served URL and the import map that
 * resolves its bare specifiers.
 *
 * Its map is scoped to `/assets/app/`, so it covers every app module served
 * from that namespace — including client entries the renderer loads later.
 * Each client entry still merges its *own* map (the `remix/ui/*` subpaths only
 * it imports) into the document through `resolveClientEntry` below, so this is
 * the floor, not the whole map.
 */
export const remixBootstrapEntry = await remixAssetServer.getScriptEntry(
	assetSourcePath('app/entry.js'),
)

/**
 * Turns a `clientEntry()` source ID into the browser module metadata the
 * server renderer emits for hydration.
 *
 * `render()` (the middleware, in `app/router.ts`) does this itself from its
 * `assets` option. This export exists for the one render path that cannot use
 * the middleware — the per-render `resolveFrame` branch in
 * `app/components/render.ts`, which calls `renderToStream` directly and would
 * otherwise fall back to the renderer's default resolver and emit the raw
 * `file:` source path as a script `src`.
 */
export const resolveClientEntry: NonNullable<
	RenderToStreamOptions['resolveClientEntry']
> = async (entryId, component) => {
	const hashIndex = entryId.lastIndexOf('#')
	const sourceId = hashIndex === -1 ? entryId : entryId.slice(0, hashIndex)
	const exportName =
		(hashIndex === -1 ? '' : entryId.slice(hashIndex + 1)) || component.name
	if (exportName === '') {
		throw new Error(
			`clientEntry() needs an export name in its ID or a named component function. Received "${entryId}".`,
		)
	}
	// Same split as the middleware's own resolver: a `file:` ID is a source
	// path the asset server compiles and names, anything else is already a
	// browser URL and passes through. Keeping the branch means a malformed
	// entry ID fails the same way on these pages as on every other one.
	if (!sourceId.startsWith('file:')) return { href: sourceId, exportName }
	const { href, importMap, preloads } =
		await remixAssetServer.getScriptEntry(sourceId)
	return { href, importMap, exportName, preloads }
}
