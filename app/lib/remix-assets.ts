import * as path from 'node:path'
import { createAssetServer } from 'remix/assets'
import type { RenderToStreamOptions } from 'remix/ui/server'

const rootDir = path.resolve(import.meta.dirname, '..', '..')

/** Absolute path of a repo file, the form `remixAssetServer` takes. */
function assetSourcePath(relativePath: string): string {
	return path.join(rootDir, relativePath)
}

/**
 * Serves every browser module this app ships: its own client entries
 * (`app/**\/*.component.js`, their `app/lib/*.js` helpers, `app/entry.js`) and
 * the `remix`/`@remix-run/ui` package files they import.
 *
 * Nothing here is a hand-maintained path literal. The document's import map,
 * the bootstrap `<script src>` and every client entry's `href` are all derived
 * from the installed package version and the files on disk, so none of them
 * can drift across an upgrade — the failure the rc.2 migration hit with the
 * old literal, which pointed at a file rc.2 had already removed.
 *
 * `allowFiles` is the security boundary: only these globs are reachable, so
 * server-only `.ts`/`.tsx` sources under `app/` are not served.
 */
export const remixAssetServer = createAssetServer({
	basePath: '/assets',
	rootDir,
	allowFiles: ['app/entry.js', 'app/**/*.component.js', 'app/lib/*.js'],
	allowPackages: ['remix'],
	// No watcher. In development `hmr.ts` restarts the server process for any
	// change `remix/ui-hmr/node` cannot hot-swap, and a `.component.js` file is
	// never one it can — so the process (and this server's cache) is rebuilt on
	// every client-entry edit anyway. Enabling it is Stage 2's job, where
	// browser HMR needs a live watcher; see
	// `docs/REMIX_ASSETS_MIGRATION_PLAN.md`. Keeping it off also stops
	// `node --test`'s process-isolated test files from each starting a
	// filesystem watcher.
	watch: false,
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
	const { href, importMap, preloads } =
		await remixAssetServer.getScriptEntry(sourceId)
	return { href, importMap, exportName, preloads }
}
