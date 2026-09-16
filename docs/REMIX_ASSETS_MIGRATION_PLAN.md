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

- **Stage 1 (the architecture switch) is done**, on branch
  `claude/remix-assets-migration-rz1392`.
- **Green:** `npm run check`, `npm run typecheck`, `npm test` (600) and
  `npm run test:browser` (40, real Chromium).
- **Next:** Stage 2. Nothing in Stage 1 is a prerequisite anybody still has to
  finish; Stages 2–4 are independent of each other.

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

**Not done in this stage, on purpose:** `watch` stays `false`. In development
`hmr.ts` restarts the server process for any change `remix/ui-hmr/node` cannot
hot-swap in place, and a `.component.js` is never one it can, so the cache is
rebuilt on every client-entry edit anyway. Turning the watcher on is Stage 2's
job, where it is a hard requirement rather than a nicety.

## Stage 2 — browser HMR (`remix/ui/dev/refresh`)

The follow-up this migration was blocking, carried over from
`docs/REMIX_RC_MIGRATION_STATUS.md`'s backlog: patch an already-open tab on a
client-entry edit instead of reloading it. Needs `watch: true` plus an `hmr`
channel factory on the asset server (`BrowserHmrChannelFactory`, typed in
`@remix-run/assets`), and the browser-side client wired into `app/entry.js`.

Two things to settle first, neither of them measured yet:

- The watcher must not run under `node --test`. Each test file is its own
  process and would start its own watcher; that is exactly why `watch: false`
  is there today. A `NODE_ENV === 'development'` gate is the obvious answer
  but has not been proven against the HMR path.
- `hmr.ts` already restarts the process on a `.component.js` edit. A restart
  that races the browser patch would undo it, so the two loops need to agree
  on who owns client-entry files.

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
- **`assetHref()` is the only way to name a browser module's URL.** Nothing
  hard-codes an `/assets/...` path, tests included. The mount layout and any
  future fingerprinting (Stage 3) are the asset server's to decide.
