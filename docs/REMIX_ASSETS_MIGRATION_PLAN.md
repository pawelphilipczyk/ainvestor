# Remix assets migration — plan and status

**Read this first when picking this migration back up.** It is the successor to
`docs/REMIX_RC_MIGRATION_STATUS.md`, which ended with the staged rc.2 plan
complete and this work as its second open follow-up.

The rc.2 migration deliberately left every browser module on
`remix/middleware/static`. That was the right call at the time and the reason
is recorded in `docs/REMIX_RC_MIGRATION_PLAN.md` (Stage 5, reason 3): the asset
server's `getImportMap()`/`getScriptEntry()` key their mappings to a `scopes`
entry for the **importing module's own served URL**, so a scoped map never
resolves for a module served from outside the asset server's namespace. That
finding was correct. What it implied — and what this migration does — is that
the fix is to move the importing modules *into* that namespace, not to work
around the scoping.

---

## Where we are

- **Stage 1 (the architecture switch) is done and merged on `main`** (PR #202).
- **Stage 2 (browser HMR) is done**, on branch
  `claude/remix-assets-migration-rz1392`.
- **Green:** `npm run check`, `npm run typecheck`, `npm test` (601) and
  `npm run test:browser` (40, real Chromium).
- **Next:** Stage 3 or Stage 4, in either order — they are independent. Stage 4
  is the larger win of the two.

## Stage 1 — serve client entries from the asset server. **Done.**

Every browser module this app ships now comes from `createAssetServer()` in
`app/lib/remix-assets.ts` rather than `staticFiles('app', …)`, which is gone.

| Before | After |
|---|---|
| `clientEntry('/features/x/y.component.js#Y', …)` | ``clientEntry(`${import.meta.url}#Y`, …)`` |
| Served verbatim at `/features/x/y.component.js` | Compiled and served at `/assets/app/features/x/y.component.js` |
| `browserModulePaths`: 6 hand-written `node_modules/**` path literals | Derived from each entry's own module graph |
| A flat top-level import map, assembled by hand | Scoped maps merged into the document by the renderer |
| No `modulepreload` hints | 53–62 per page, emitted by the renderer |

The mechanical parts: `render({ assets: remixAssetServer })` in
`app/router.ts`, `<ImportMap value={remixBootstrapEntry.importMap} />` and
`<script type="module" src={remixBootstrapEntry.href} />` in
`document-shell.tsx`, and the 15 `clientEntry()` IDs.

Three things were less obvious and are worth keeping in mind:

1. **`render()`'s `assets` option does not cover every render.** Four pages
   (`/portfolio`, `/guidelines`, `/catalog`, `/advice`) pass a per-render
   `resolveFrame` and so call `renderToStream` directly, bypassing the
   middleware — the gap Stage 5 recorded under reason 3. Their client entries
   would have fallen back to the renderer's default resolver, which passes a
   `file:` source ID straight through as a script `src`. `app/components/render.ts`
   now passes the same resolver (exported as `resolveClientEntry`), and
   `app/lib/remix-assets.test.ts` fails on all four pages if it is removed.
2. **The asset server compiles what it serves.** A served `.component.js` is
   no longer byte-identical to the file on disk — quoting in particular is
   the compiler's choice. Assertions against a served body are assertions
   about compiled output; four of them needed relaxing. Assert against the
   source file when the source is what you mean.
3. **`renderToString` takes no `resolveClientEntry` hook** (`renderToStream`
   does). A component rendered through it still emits its raw `file:` entry
   ID, so a test that needs the real browser URL has to go through the router.

**The watcher is on in development, off everywhere else.** This server caches
each module's *compiled* output, where `staticFiles()` used to read the file
per request, so without a watcher a dev edit to a client entry is served
stale. `hmr.ts` does not cover for it: `remix/ui-hmr/node` hot-swaps a
`.component.js` edit in place with no process restart, so nothing rebuilds
this cache. Measured, not assumed — with `watch: false`, an edit logged
`hmr update …` and the edited export was still absent from the served module.
It stays off under `node --test` (each test file is its own process and would
start its own watcher) and in production (nothing changes on disk, and
Stage 3's `fingerprint` requires it off).

## Stage 2 — browser HMR. **Done.**

Editing a client entry now patches an already-open tab instead of reloading
it. Confirmed live with Playwright against the real dev server: the edited
`aria-label` reached the DOM, a `window` sentinel set before the edit survived
it (so the document was never reloaded), and the console logged
`[remix] HMR accepted update /assets/app/…/theme-toggle.component.js`.

Four wires, all in `app/lib/remix-assets.ts` and `server.ts`:

| Piece | What it does |
|---|---|
| `scripts: { loaders: [uiHmr()] }` (`remix/ui-hmr/assets`) | Instruments component modules with `import.meta.hot` boundaries |
| `hmr: () => createBrowserHmrChannel()` (`remix/node-hmr/runtime`) | Connects this child process to the EventSource server `hmr.ts` owns |
| `watch` | Already on in development from Stage 1; HMR is rejected without it |
| `emitServerReady()` after `listen` | Stops `node-hmr` publishing `server:update` before the restarted server accepts requests |

Nothing was needed in `app/entry.js`, which the Stage-1 plan expected. The
asset server generates the browser HMR client itself and injects an import of
it into any module the loader gave an `import.meta.hot` boundary, so the
client arrives with the entry that needs it.

**`remix/ui/dev/refresh` is still not imported by this app** — the export the
rc.2 status doc named as this follow-up's goal. `reconcileRoots` and
`setComponentStalenessCheck` are consumed by `@remix-run/ui-hmr`'s own browser
runtime, which the asset server serves; reaching for them directly is not part
of wiring HMR up. The goal behind the name — patching an open tab — is met.

Both questions this stage opened are now answered:

- **The watcher stays out of `node --test`.** Everything is keyed on
  `REMIX_NODE_HMR`, which only the `hmr.ts` child has, and `watch` is
  *derived* from that flag rather than set beside it, so no later edit can
  enable HMR with watching off (the asset server rejects that pairing).
  `npm test` runs in ~8 s with no hang, and a test asserts no served module
  carries HMR instrumentation.
- **The server-side hot-swap and the browser patch do not race.** Both fired
  on the same edit in the measurement above and the tab still patched
  correctly.

**Not covered by CI, deliberately.** The HMR path needs a process supervised
by `node-hmr`; the browser-test harness boots the router in-process. Standing
up supervision there would be a harness rewrite for dev-only tooling — the
same call Stage 7 of the rc.2 migration made for `remix/node-hmr` itself. What
CI *does* pin is the direction that would hurt in production: that no HMR
instrumentation reaches a served module when the flag is off.

One consequence worth knowing: the asset server's watcher and HMR channel hold
the event loop open, so `server.ts`'s shutdown handler now closes it. Without
that, Ctrl-C would not stop the dev server.

## Stage 3 — fingerprinting and cache headers

`createAssetServer({ fingerprint: true })` gives content-hashed URLs and
immutable caching; today every asset is served `Cache-Control: no-cache`.
Mutually exclusive with `watch`, so it is a production-only setting and lands
naturally after Stage 2 has made the dev/prod split explicit.

## Stage 4 — typed client entries (`.component.ts`)

The largest win available, and the one that closes the standing top risk in
`docs/REMIX_RC_MIGRATION_PLAN.md` ("untyped client code"). The asset server
compiles TypeScript on demand, so a client entry can be a `.ts` file inside
`tsconfig.json`: `npm run typecheck` would cover it, and the 13
`.component.d.ts` sidecars that exist only to describe it to TypeScript would
go away.

Scope check before starting: `allowFiles` currently lists `app/**/*.component.js`
precisely so no `.ts` under `app/` is reachable. Admitting `.component.ts` means
the glob is the only thing standing between a browser request and a
server-only module, so audit it deliberately rather than widening it to
`app/**/*.ts`.

## Decisions taken — do not relitigate

- **The whole cutover landed in one change, not one entry per PR.** Stage 6 of
  the rc.2 migration moved one component per PR because each port changed
  behavior and markup. This one changes neither: it rewrites the first
  argument of `clientEntry()` and nothing else, and a half-migrated app would
  have had to keep both serving mechanisms *and* the hand-maintained import
  map the migration exists to delete. The 40 browser tests cover the result in
  real Chromium.
- **The document import map is the bootstrap entry's map, not an eager map of
  every entry.** Building a complete map at startup costs ~520 ms
  (`getAssets()` + `getImportMap()` over all 22 modules) in every process,
  including each of the ~90 process-isolated test files. `getScriptEntry()`
  for `app/entry.js` alone costs ~55 ms — about what the six `getHref()` calls
  it replaced cost — and the renderer merges each page's own entries into the
  `<head>` map from there.
- **Browser HMR is gated on `REMIX_NODE_HMR`, not `NODE_ENV`.** It is the flag
  that actually describes the requirement — `remix/node-hmr/runtime` throws if
  imported by a process `node-hmr` is not supervising, and `server.ts` is the
  same entry module under `npm start`. Hence the dynamic import behind the
  flag in both files rather than a top-level one.
- **`assetHref()` is the only way to name a browser module's URL.** Nothing
  hard-codes an `/assets/...` path, tests included. The mount layout and any
  future fingerprinting (Stage 3) are the asset server's to decide.
