# Remix assets migration plan

Moving browser-facing code from hand-served static files onto **`remix/assets`**,
and taking the Remix capabilities that only become reachable once it is in place —
browser-side HMR chief among them.

**Read `docs/REMIX_ASSETS_MIGRATION_STATUS.md` first** when picking this up. It
holds *where we are* and *what is next*. This file holds the goal, the inventory,
the stages and the rationale; the status file points at it rather than repeating
it, so the two cannot drift.

## The goal

**Use Remix APIs wherever Remix has one. Keep hand-rolled code to the minimum.**

Same organizing principle, and the same decision rule in both directions, as
`docs/REMIX_RC_MIGRATION_PLAN.md` — that plan's Stages 1–7 are complete, and this
one picks up the follow-up it recorded. Adopting a Remix API is the default and
needs no justification. *Keeping* hand-rolled code is the exception and must clear
a stated bar, recorded in a comment where the code lives:

1. Remix ships nothing for it, **or**
2. it is genuine app or domain logic, **or**
3. the Remix API was tried against this codebase and demonstrably does not fit —
   with the specific gap named.

"We already wrote it", "ours works", and "the swap looked fiddly" are not reasons.
Neither is a guess that the API will not fit: reason 3 requires a real attempt.

## Why now

`docs/REMIX_RC_MIGRATION_STATUS.md` closed Stage 7 with two follow-ups. This
migration is the second one, and it turns out to be the larger of the two:

- Browser-side HMR (`remix/ui/dev/refresh`) needs client entries served through
  `remix/assets`. That was the recorded blocker.
- The same switch also retires the hand-maintained import-map table, unlocks
  dependency preloading, and is a precondition for fingerprinted asset caching —
  none of which were visible when the follow-up was first written.

## What Remix takes over

| Hand-rolled today | LOC | Replace with | Stage |
|---|---:|---|---|
| `browserModulePaths` / `remixUiImportMap` in `app/lib/remix-assets.ts` — a hand-maintained specifier→dist-path table | ~40 | `assetServer.getScriptEntry()` / `getImportMap()` | 3 |
| 15 hand-written `clientEntry('/literal/path.js#Export', …)` ids | 15 lines | `clientEntry(import.meta.url, …)` | 1–2 |
| `appStatic` (`staticFiles('app', { filter })`) in `app/router.ts` for `.component.js` / `entry.js` / three `lib/*.js` | ~8 | `remix/assets` serving + access control | 3 |
| `<script type="module" src="/entry.js">` literal in `document-shell.tsx` | 1 | `getScriptEntry('app/entry.js')`'s resolved href | 3 |
| Nothing — no dependency preloading exists today | — | `getScriptEntry()`'s `preloads` (measured: 48 links) | 1–3 |
| Nothing — full reload on every client-entry edit | — | `remix/ui/dev/refresh` + `uiHmr()` + `hmr` channel | 4 |
| Nothing — no asset fingerprinting or minification | — | `fingerprint` / `minify` / `target` / `sourceMaps` | 5 |
| No shared asset config; CLI unused | — | `remix.json` + `remix assets` / `remix doctor` / `remix routes` | 6 |

## Validation already performed

A throwaway spike was built, measured live in Chromium, then reverted (the same
method `0b05bbe` and the button/input measurement used). Its diff is not in the
repo; these are its results, and they are the empirical basis for the stages below.

**It works, and it can be done incrementally.** `resolveClientEntry`
(`@remix-run/render-middleware/src/lib/render-ui.ts`) branches **per entry** on
whether the id starts with `file:`. A migrated entry and an unmigrated one coexist
in the same document — measured with 1 of 15 switched, everything else untouched
and working. There is no big-bang step in this migration.

**Per-entry cost is one line.** `exportName` falls back to `component.name`, and
all 15 entries already name their function to match their export, so the `#Export`
suffix is not needed:

```diff
-  '/components/navigation/theme-toggle.component.js#ThemeToggle',
+  import.meta.url,
```

**The blocker, and that it is fixable.** The five pages that bypass
`context.render()` to pass a per-call `resolveFrame` — the Reason-3 carve-out
recorded in `app/components/render.ts` and in the RC plan's Stage 5 — never
receive the asset server's `resolveClientEntry`. Measured on those pages with one
entry migrated:

```
/            file:// leaks: 0
/portfolio   file:// leaks: 1
/guidelines  file:// leaks: 1
/advice      file:// leaks: 1
```

The leaked value is a raw `file:///home/…/app/components/…` absolute server path
emitted into public HTML, and Chromium refuses it — `Not allowed to load local
resource`, then `[createFrame] Failed to load module`. The theme toggle was
**dead** on `/portfolio` while working on `/`. So this is both an absolute-path
disclosure and a silent hydration break, on exactly the pages carrying the most
client entries. Mirroring the middleware's own resolver into `render.ts`'s direct
branch fixed it: 0 leaks on all four pages, `/portfolio` hydrating again, no
console errors. **Stage 0 exists because of this** — it must land before any entry
migrates.

**Import maps merge; the polyfill is not needed for initial load.** An earlier
reading of the docs suggested `remix/multiple-import-maps-polyfill` would be
required. Measured: the renderer emitted a *single* `<script type="importmap">`
combining the app's flat `imports` with auto-generated `scopes` for `/assets/app/`
and `/assets/npm/`. The polyfill question is scoped to Stage 4's runtime
HMR-added maps only.

**Browser HMR genuinely works.** With `hmr` + `scripts.loaders: [uiHmr()]` wired
and a tab open, editing a component's class string on disk:

```
tab preserved (no reload): true
sun icon class after edit : h-8 w-8 rotate-0 scale-100 …
changed without reload    : true
console: [remix] HMR connected
         [remix] HMR accepted update /assets/app/components/navigation/theme-toggle.component.js
```

Unmigrated entries get nothing — no reload and no patch, so an open tab silently
goes stale. That is unchanged from today's behavior, not a regression, but it does
mean Stage 4's benefit arrives in proportion to Stage 2's completeness.

**Costs measured, not assumed.** Switching one entry added **48
`<link rel="modulepreload">`** tags (the asset server walks the whole
`@remix-run/ui` runtime graph) and took the home document to ~24KB. Those modules
are already fetched today by import-map waterfall, so this front-loads them rather
than adding requests — but the HTML grows on every page. Files are also
**recompiled, not passed through** (source `'remix/ui'` arrives as `"remix/ui"`),
served with an ETag and `Cache-Control: no-cache`.

**Test impact.** 589/590 passed with one entry migrated. The failure is
`theme-toggle.test.ts` asserting the flat `moduleUrl`. The deeper point: a bare
`renderToString` in a test has no asset server, so it emits the `file://` id —
server-render tests that assert hydration wiring need either updated assertions or
a `resolveClientEntry` in the test helper.

## Staged plan

Each stage lands green (`npm run check && npm run typecheck && npm test`, plus
`npm run test:browser` where the change is client-side) and is independently
revertible. Stages 1–2 are further splittable per entry, so a session can take as
few as one.

**Stage 0 — Unblock client-entry resolution. Prerequisite for everything else.**
Add `allowFiles` for app source to `remixAssetServer`, pass
`render({ assets: remixAssetServer })` in `router.ts`, and mirror the middleware's
`resolveClientEntry` into `render.ts`'s direct-`renderToStream` branch. No entry
migrates yet, so this is inert by construction — every entry id is still a literal
path and takes the pass-through branch. Ships alone, safely.

**Stage 1 — First entry, plus the guard that proves Stage 0.** Migrate
`theme-toggle.component.js` (best-covered: 4 browser tests plus server-render
tests). Add a cross-page regression test asserting no `file://` appears in any
rendered page — write it first and confirm it fails without Stage 0's fix, per
this repo's characterization-test habit. Update the `moduleUrl` assertion. This
stage establishes the per-entry recipe the next one repeats.

**Stage 2 — Migrate the remaining 14 entries.** One line each, plus each entry's
own `moduleUrl` assertion. Natural session splits by area: layout/navigation (3),
catalog (4), guidelines (3), portfolio (2), advice (2). Each group lands green on
its own; there is no ordering dependency between them.

**Stage 3 — Retire what the switch replaces.** Once every entry and `entry.js` are
asset-served: delete `browserModulePaths`/`remixUiImportMap` (and with them the
"add a pair here when a client entry starts importing a new `remix/ui` subpath"
maintenance burden), resolve `document-shell.tsx`'s `entry.js` script tag through
`getScriptEntry('app/entry.js')`, and narrow or remove `appStatic`'s filter. This
is where the deletion this migration is for actually lands.

**Stage 4 — Browser-side HMR.** Wire `hmr` (channel from `remix/node-hmr/runtime`)
and `scripts: { loaders: [uiHmr()] }`, with `watch` on in development and off
everywhere else. Verify live the way the spike did — marker survives, DOM patches,
no reload. Decide `remix/multiple-import-maps-polyfill` on measurement against a
non-Chromium browser, not on assumption.

**Stage 5 — Production asset hardening.** Decide each on measurement, not default:
`fingerprint: true` (immutable caching; requires `watch: false`, so it is a
production-only posture), `minify`, `target`, `sourceMaps`. Check what the Fly
image and the preview deploy actually serve today before changing headers.

**Stage 6 — The rest of the Remix surface this opens up.** Lower priority, real
adoption value:

- `remix.json` shared asset config, so the server and the CLI read one source.
- `remix assets` / `remix assets inspect <url>` to verify access control — a
  direct check on Stage 0's `allowFiles` instead of trusting the globs.
- `remix doctor` in CI (it runs; it only warned here because this sandbox is on
  Node 22 and the project requires ≥ 24.3.0, which CI already satisfies).
- Re-measure the reason-3 carve-outs this migration's new capabilities may
  unblock: `app/lib/event-listeners.js` (56), `app/lib/scroll-lock.js` (90),
  `app/lib/dialog-trigger.js` (15), and `render()` from `remix/ui/test` — which
  the RC plan ruled out for needing a DOM, a judgement made before this repo had
  a Playwright harness.

## Risks

**The five direct-render pages are the whole risk surface.** Everything that can
break badly in Stages 1–2 breaks there, silently, and only in a browser. The
Stage 1 guard test exists so this cannot regress unnoticed; do not skip it.

**Partial migration means partial HMR.** Stage 4's value scales with Stage 2's
completeness. Landing Stage 4 early would look broken — some components patch
live, others go stale — so keep it after Stage 2.

**A dev/prod conditional comes back.** `watch` must be on in development and off
in test and production, or all 88 test suites each start a filesystem watcher.
The RC migration deliberately eliminated environment ternaries from the middleware
chain; this one reintroduces a narrow, justified instance. Keep it scoped to the
asset server's options — do not let it spread.

**Document weight grows on every page.** 48 preload links from one entry; measure
again once all 15 are migrated rather than extrapolating, and decide in Stage 5
whether the front-loading is worth the bytes.

**Still a pre-release.** `remix@3.0.0-rc.2` may be followed by further breaking
changes. Re-run these measurements against whatever is current at implementation
time rather than trusting this document's observations.

## Open questions

1. **Controller file convention.** `remix routes` renders this app's whole route
   tree but reports `[missing]` for every controller — it expects a
   `<name>/controller.tsx` layout this app does not use (`app/features/<name>/
   index.ts` plus `router.map()`). Is there a first-party convention worth
   adopting, and is that a separate migration rather than part of this one?
2. **`entry.js`'s own resolution.** It is the document's root module script, not a
   `clientEntry()`. Stage 3 assumes `getScriptEntry('app/entry.js')` at module
   scope (precedent: `remix-assets.ts` already top-level-awaits `getHref`).
   Confirm before relying on it.
3. **Does `staticFiles` survive at all?** After Stage 3, `public/favicon.ico` is
   the only non-module asset. Either keep a narrow `staticFiles`, or serve it
   through the asset server's `files.extensions`. Decide in Stage 3.
