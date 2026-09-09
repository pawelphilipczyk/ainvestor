# Remix RC migration plan

Working checklist for moving this app from `remix@3.0.0-beta.0` to the newest
published Remix 3 build, **`3.0.0-rc.2`**.

Sources to check before each implementation step:

- Remix API docs: <https://api.remix.run/>
- Remix package changelog:
  <https://github.com/remix-run/remix/blob/main/packages/remix/CHANGELOG.md>
- Remix UI changelog:
  <https://github.com/remix-run/remix/blob/main/packages/ui/CHANGELOG.md>

## There is no Remix 3.0 final, and no "1.0"

Registry state at the time of writing (`npm view remix dist-tags`):

| Tag | Version | Meaning |
|---|---|---|
| `latest` | `2.17.5` | The **Remix 2** lineage. Not our line — installing `remix@latest` is a downgrade to a different framework generation. |
| `next` | `3.0.0-rc.2` | Newest Remix 3 build. **This is the migration target.** |
| `rc` | `1.0.0-rc.4` | A stale 2021-era tag. Unrelated to any current release — the only place a "1.0" appears. |

The full 3.x line published so far is `alpha.0`–`alpha.6`, `beta.0`–`beta.6`,
`beta.9`, `beta.10`, `rc.1`, `rc.2`. So this is **beta.0 → rc.2**, skipping ten
intermediate builds. Remix 3 has not shipped a stable release, so the app stays
on a pre-release either way; the gain is moving to the last pre-release before
GA and landing the API renames while the diff is small.

## Baseline

- Current: `remix@3.0.0-beta.0` (locked), `@remix-run/ui@0.1.1`
- Target: `remix@3.0.0-rc.2`, `@remix-run/ui@0.9.0`
- Surface: 170 TS/TSX files, ~29k LOC; 24 distinct `remix/*` import specifiers
- `remix/data-schema` is **unchanged** (`0.3.0` in both) — all 14 schema imports are safe

The heaviest dependency move by far is `@remix-run/ui` **0.1.1 → 0.9.0**. In
0.x semver every minor may break, and eight of them land at once.

## Validation already performed

This plan is not a paper exercise. A full trial migration was run in a scratch
copy of the repo against a real `remix@3.0.0-rc.2` install:

| Stage | Result |
|---|---|
| rc.2 installed, no code changes | 20 typecheck errors (all cascading from 9 missing module specifiers) |
| after specifier renames | 12 errors, in 4 real clusters |
| after context + router refactor | 6 errors |
| after `href` + `Session` fixes | **0 typecheck errors** |
| test suite, after vendoring two removed helpers | **566 / 569 passing** |

Baseline on current beta.0 for comparison: **569 passing, 0 failing.**

The 3 remaining failures are all in `app/components/layout/sidebar.test.ts` and
assert the *old* import-map / runtime-serving contract that this migration
deliberately changes. They are expected test updates, not unexplained breakage.

Trial diff size: **23 files**.

## Breaking changes

### 1. Module specifiers renamed (mechanical, 12 file-touches)

Every middleware moved under `remix/middleware/*`, and the router split into
`remix/router` + `remix/routes`. The underlying `dist/` filenames are unchanged,
so this is a pure specifier swap with no behavior change.

| Before | After | Files |
|---|---|---|
| `remix/fetch-router` | `remix/router` | 4 |
| `remix/fetch-router/routes` | `remix/routes` | 1 |
| `remix/session-middleware` | `remix/middleware/session` | 1 |
| `remix/static-middleware` | `remix/middleware/static` | 1 |
| `remix/logger-middleware` | `remix/middleware/logger` | 1 |
| `remix/compression-middleware` | `remix/middleware/compression` | 1 |
| `remix/form-data-middleware` | `remix/middleware/form-data` | 1 |
| `remix/method-override-middleware` | `remix/middleware/method-override` | 1 |
| `remix/session/cookie-storage` | `remix/session-storage/cookie` | 1 |

### 2. Request context is now derived from the middleware chain

This is the one genuine architectural change, and it is the reason the naive
port produces a wall of errors in `app/router.ts`.

`ContextEntry` changed from a **tuple** to an **object**:

```ts
// beta.0
type ContextEntry = readonly [key, value]

// rc.2
interface ContextEntry { key; value; property? }
```

`MergeContext`, `SetContextValue`, `WithParams`, `BuildAction`,
`ApplyMiddleware*` and `MiddlewareContextTransform` were all **removed**.
`ContextWithEntries`, `ContextWithEntry`, `ContextWithParams`, `RouterTypes`,
`createMiddleware`, `createAction` and `createController` were added.

More importantly, middleware now carry their context contribution in the type
system, and the router threads the composed shape through to every controller.
`logger()`, for example, now contributes `{ key, value, property: 'logger' }`.
A hand-written `AppRequestContext` listing only `FormData` and `Session` no
longer matches what the router computes, so **every** `router.map(...)` call
fails to typecheck.

The fix is to stop hand-maintaining the type and derive it from the chain:

```ts
// app/router.ts
export const appMiddleware = createMiddleware(
	appStatic, remixRuntime, compression(), logger(), uiLocaleMiddleware(),
	session(sessionCookie, sessionStorage), multipartLimitFlashOnError(),
	formData({ /* … */ }), methodOverride(), enforceGithubApproval(),
)

export const router = createRouter({ middleware: appMiddleware })
```

```ts
// app/lib/request-context.ts
import type { MiddlewareContext } from 'remix/router'
import type { appMiddleware } from '../router.ts'

export type AppRequestContext = MiddlewareContext<typeof appMiddleware>
```

This single change cleared all 12 router errors in the trial. It also lets the
`as unknown as Middleware` cast in `enforceGithubApproval()` go away, and it
satisfies the AGENTS.md rule about preferring Remix's own APIs over
hand-rolled equivalents.

**Consequence — the dev/prod middleware ternary must go.** Today `app/router.ts`
picks `logger()` in development and `compression()` in production. Those two
branches now produce *different context types*, so the ternary yields a union
the router cannot accept. The trial resolved this by running **both** in both
environments (one stable tuple). That is a real behavior change: compression in
dev, request logging in prod. See Open questions.

### 3. `context.get()` can now return `undefined`

Context reads are typed against the entry's fallback, which now includes
`undefined` when the key has no default. `app/lib/multipart-limit-flash-middleware.ts`
needs an explicit guard after `context.get(Session)` even though it already
calls `context.has(Session)` — `has()` does not narrow.

### 4. `href()` search params must nest under `searchParams`

`route-pattern` 0.20.1 → 0.24.0. The second argument became an options object:

```ts
// before
routes.advice.index.href({}, { tab: 'buy_next' })

// after
routes.advice.index.href({}, { searchParams: { tab: 'buy_next' } })
```

9 call sites across advice, guidelines and catalog. `baseURL` is also newly
supported. Note this is a **silent trap**: passing the old shape to a route with
no required params still typechecks in some positions but drops the query
string, so rely on the compiler *and* check the 9 sites by hand.

### 5. `addEventListeners` was removed from `@remix-run/ui`

Used in **8 client components**. Because these are `.js` files outside
`tsconfig.json`'s `include`, **typecheck will not catch this** — it fails at
module link time with `SyntaxError: does not provide an export named
'addEventListeners'`.

`on()` is not a replacement: it is an element-level mixin applied through JSX
props, whereas every one of our call sites does document-level delegation
(`addEventListeners(document, handle.signal, { click… })`).

The removed implementation is ~25 self-contained lines wrapping native
`addEventListener(type, handler, { signal })` plus a re-entry `AbortController`
for two-argument listeners. **Recommendation: vendor it** as
`app/lib/event-listeners.js`. That converts 8 risky rewrites into one copied
helper and one import change per file, preserving the re-entry semantics our
components rely on.

### 6. `remix/ui/scroll-lock` is gone

`lockScroll` moved to `dist/popover/scroll-lock.js` and is **not publicly
reachable** — `@remix-run/ui`'s `popover` entry exports `{}`. Imported by
`app/components/layout/sidebar.component.js`; it was the single root cause of
all 9 initial test failures in the trial.

~50 self-contained lines, no imports. **Vendor as `app/lib/scroll-lock.js`**
and revisit if a public export appears before GA.

### 7. Client `resolveFrame` signature changed — and we can now delete ours

```ts
// beta.0
type ResolveFrame = (src, signal?, target?) => …

// rc.2
type ResolveFrame = (src, options?: { target, formData, method, encType, signal }) => …
```

`app/entry.js` passes `signal` **positionally** as the second argument, so it
would silently receive an options object. Plain JS, browser-only — neither the
typechecker nor the test suite catches this. It is the highest-risk item here.

The good news: in rc.2 `resolveFrame` is **optional**, and the built-in default
fetches the frame source as HTML with the submitted form data, method, encoding
and abort signal — a superset of our hand-rolled GET-only version. It can also
return a `Response` directly (`FrameResolution`).

**Recommendation: delete the custom `resolveFrame` from `app/entry.js`** and let
the default handle it. This removes the break and gains form-submission support.
`loadModule` is still required and stays.

### 8. Smaller items

- `RenderFn<Props>` → `RenderFn` (zero-arg). We already use `return () => …`, so no change.
- `handle.update()` now throws if called during render/before first commit. **Not used** in this repo.
- Server-side `resolveFrame` in `RenderToStreamOptions` is **unchanged**; all 5 server call sites take only `(source)` and are safe.
- `@remix-run/test` 0.3 → 0.6 is irrelevant — tests use plain `node:test`.
- New and worth a follow-up, not this migration: an `ImportMap` component in `remix/ui/server`, plus `remix/spa`, `remix/middleware/render`, `remix/multiple-import-maps-polyfill`, `remix/ui-hmr` / `remix/node-hmr`, and a real component library (`remix/ui/button`, `tabs`, `select`, `menu`, `popover`, …).

## Staged plan

Each stage should land green (`npm run check && npm run typecheck && npm test`).

**Stage 1 — bump and rename.** Move `package.json` to `remix@3.0.0-rc.2`,
reinstall, apply the nine specifier renames from §1. Expect the build to still
be red on context typing; that is Stage 2.

**Stage 2 — router and context.** Introduce `appMiddleware` via
`createMiddleware`, collapse the dev/prod ternary, rewrite
`app/lib/request-context.ts` to `MiddlewareContext<typeof appMiddleware>`, drop
the `as unknown as Middleware` cast, add the `Session` undefined guard.
Typecheck should reach zero here except for `href`.

**Stage 3 — `href` call sites.** Nest the 9 search-param objects under
`searchParams`. Typecheck now clean.

**Stage 4 — client runtime.** Vendor `app/lib/event-listeners.js` and
`app/lib/scroll-lock.js`; repoint the 8 + 1 importing components. Delete the
custom `resolveFrame` from `app/entry.js`. Update the import map and the
`remixRuntime` static allowlist in `app/router.ts` — the current entries point
at `@remix-run/ui/dist/utils/scroll-lock.js`, which no longer exists.

**Stage 5 — tests and docs.** Update the 3 `sidebar.test.ts` assertions that
encode the old import-map contract, plus the `theme-toggle` / `tabs-nav`
assertions that match on `addEventListeners` import text. Refresh
`docs/REMIX_V3_PACKAGES.md` and mark `docs/REMIX_BETA_MIGRATION_PLAN.md`
superseded.

**Stage 6 — manual browser pass.** Non-negotiable, because the riskiest changes
(`entry.js`, the vendored helpers, the import map) are invisible to both the
typechecker and the test suite. Exercise: sidebar open/close on mobile including
scroll lock, theme toggle, locale select, every `<Frame>` fragment (portfolio,
guidelines, catalog list, catalog ETF analysis, advice result), form submission
via `FrameSubmitEnhancement`, and navigation loading states. Verify in Firefox
or Safari too — `app/entry.js` carries a `window.navigation` stub for
non-Chromium browsers.

## Risks

**Highest — untyped client code.** §5, §6 and §7 all live in `.js` files that
`tsconfig.json` does not include. Two of the three fail loudly at import time;
the `resolveFrame` signature change fails **silently and only in a browser**.
Stage 6 is the only thing standing between that and a production regression.

**Behavior change from collapsing the middleware ternary.** Running compression
in dev and the logger in prod is a real change to both environments. Prefer
tuning each middleware's options over reintroducing a conditional chain — the
conditional is what the new context typing rejects.

**Still a pre-release.** rc.2 may be followed by rc.3 or further breaking
changes before GA. Re-run the trial-migration method above against whatever is
newest at implementation time rather than trusting this document's version
numbers.

**Node version.** `package.json` requires Node `>=24.3.0` and the Remix CLI
declares the same. Confirm CI and the Fly image satisfy it.

## Open questions

1. **Timing.** rc.2 is not GA. Land this now for a small diff and early warning
   of API churn, or wait for 3.0.0 final and absorb one larger jump? This plan
   assumes now, and the validated 23-file diff supports that.
2. **Dev/prod middleware.** Accept compression-in-dev and logging-in-prod, or
   invest in a different structure that keeps them conditional under the new
   context typing?
3. **Vendoring.** `event-listeners.js` and `scroll-lock.js` are copied from
   MIT-licensed Remix source. Acceptable as a documented stopgap with a link
   back to upstream, or should the sidebar and the 8 components be rewritten
   onto supported APIs instead? Vendoring is what the validated trial did.
4. **Component library.** rc.2 ships real `remix/ui/*` primitives (button, tabs,
   select, menu, popover). Out of scope here, but they overlap our hand-rolled
   `SubmitButton`, `TabsNav` and sidebar overlay — worth a separate assessment
   against the AGENTS.md "maximize Remix package usage" rule.
