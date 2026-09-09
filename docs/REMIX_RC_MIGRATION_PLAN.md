# Remix RC migration plan

Working checklist for moving this app from `remix@3.0.0-beta.0` to the newest
published Remix 3 build, **`3.0.0-rc.2`**, and for **deleting hand-rolled code
in favour of the Remix APIs that now cover it**.

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

The heaviest dependency move by far is `@remix-run/ui` **0.1.1 → 0.9.0**. In
0.x semver every minor may break, and eight of them land at once. That same jump
is what makes most of the deletions below possible.

## Guiding principle: every stage should delete hand-rolled code

**This is the point of the migration, not a side effect.** Per AGENTS.md
("Maximize Remix package usage" and "If you find code that a Remix package could
replace, refactor it"), we take the Remix API in every case where one now
exists, and keep hand-rolled code only where the framework genuinely offers
nothing. rc.2 closes a lot of those gaps.

Candidate inventory, with the status of each replacement:

| Hand-rolled today | LOC | Replace with | Availability |
|---|---:|---|---|
| Custom `resolveFrame` in `app/entry.js` | ~10 | Built-in default resolver | **New in rc.2** |
| `IMPORT_MAP` in `document-shell.tsx` + `remixRuntime` allowlist in `router.ts` | ~15 | `ImportMap` from `remix/ui/server` + `@remix-run/assets` `AssetServer` | **New in rc.2** |
| `app/components/render.ts` | 55 | `render()` from `remix/middleware/render` → `context.render(node, init)` | **New in rc.2** |
| `tabs-nav.tsx` + `tabs-nav-scroll.component.js` | 202 | `remix/ui/tabs/primitives` | **New in rc.2** |
| `text-input` / `number-input` / `textarea-input` | 239 | `remix/ui/input` | **New in rc.2** |
| `theme-toggle.tsx` + `.component.js` | 76 | `remix/ui/toggle/primitives` | **New in rc.2** |
| `select-input.tsx` | 91 | `remix/ui/select/primitives` | **New in rc.2** (styled `select` existed; primitives did not) |
| Sidebar overlay: scroll lock, outside-click, focus restore in `sidebar.component.js` | 107 | `remix/ui/popover` — `surface` does all three internally | Since beta.0 |
| `submit-button.tsx` + `submit-button-loading.component.js` | 151 | `remix/ui/button` | Since beta.0 |
| `app/lib/form-data-payload.ts` | 11 | `remix/data-schema/form-data` | Since beta.0 — its comment ("there is no separate parser") is simply wrong |
| `tsx` dev loop (`tsx watch server.ts`) | — | `remix/node-hmr` + `remix/ui-hmr` + `remix/ui/dev/refresh` | **New in rc.2** |
| Direct `tsx` dependency | — | `remix/node-tsx` (oxc-based TS loader, already a transitive dep) | **New in rc.2** |
| Source-text assertions (`assert.match(body, /addEventListeners/)`) | — | `render()` from `remix/ui/test` | Since beta.0 |

That is on the order of **~950 LOC of components plus ~80 LOC of plumbing**
that Remix can now own, before counting the dev-tooling swaps.

### Use the `/primitives` exports, not the styled components

This matters for a Tailwind app and is the difference between a clean adoption
and a fight with the design system. rc.2 ships each control in two forms:

| Export | CSS references in `dist` | What you get |
|---|---:|---|
| `remix/ui/tabs` | 6 | Behavior **and** Remix's own styling |
| `remix/ui/tabs/primitives` | **0** | Behavior only — context, registration, keyboard activation, events |
| `remix/ui/toggle` | 2 | Styled |
| `remix/ui/toggle/primitives` | **0** | Behavior only |
| `remix/ui/select` | 3 | Styled |
| `remix/ui/select/primitives` | **0** | Behavior only |

The app has a committed Tailwind design system (`tailwindConfig`, `baseCss`,
shadcn-style tokens like `bg-card`, `text-muted-foreground`, `border-border`).
Adopting the **styled** components would mean overriding or abandoning that.
Adopting the **primitives** lets us delete the hard part — keyboard navigation,
ARIA wiring, focus management, roving tabindex, event plumbing — while keeping
every Tailwind class we already have. Default to primitives; reach for a styled
component only where we have no styling opinion.

`remix/ui/popover` is the same idea for the sidebar: `surface`, `anchor`,
`focusOnShow`/`focusOnHide` and `onOutsideClick` are mixins, not a visual
component, and `surface` calls `lockScroll()` internally.

### Where hand-rolled code still wins

Two removed helpers have no public replacement in rc.2, so a small vendored
copy is the honest answer — but as a **documented stopgap with an upstream
link**, not a permanent fork. See §5 and §6.

## Validation already performed

This plan is not a paper exercise. A full trial migration was run in a scratch
copy of the repo against a real `remix@3.0.0-rc.2` install:

| Stage | Result |
|---|---|
| rc.2 installed, no code changes | 20 typecheck errors (all cascading from 9 missing module specifiers) |
| after specifier renames | 12 errors, in 4 real clusters |
| after context + router refactor | 6 errors |
| after `href` + `Session` fixes | **0 typecheck errors** |
| test suite, after covering the two removed helpers | **566 / 569 passing** |

Baseline on current beta.0 for comparison: **569 passing, 0 failing.**

The 3 remaining failures are all in `app/components/layout/sidebar.test.ts` and
assert the *old* import-map / runtime-serving contract that this migration
deliberately changes. They are expected test updates, not unexplained breakage.

Trial diff size: **23 files.** Note the trial deliberately took the *shortest*
path to green to size the compulsory work; it did **not** yet perform the
deletions in the table above. Those are the substance of Stages 5–7.

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

The fix is itself a deletion — stop hand-maintaining the type and derive it:

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

This single change cleared all 12 router errors in the trial and lets the
`as unknown as Middleware` cast in `enforceGithubApproval()` go away.

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

**Preferred fix — delete the call sites.** Most of them exist only to hand-roll
behavior that rc.2 now ships:

- the tabs-nav listeners → `remix/ui/tabs/primitives`
- the theme-toggle listener → `remix/ui/toggle/primitives`
- the sidebar's outside-click and Escape handling → `remix/ui/popover`
- element-scoped handlers → the `on()` mixin

**Fallback only for what survives that pass.** `on()` is genuinely not a
substitute for true document-level delegation, which is what
`frame-submit.component.js` and `navigation-link-loading.component.js` do. For
those, vendor the removed helper as `app/lib/event-listeners.js` — ~25
self-contained lines wrapping native `addEventListener(type, handler, { signal })`
plus a re-entry `AbortController`. Keep the upstream link in the file header and
delete it if Remix re-exports an equivalent before GA.

### 6. `remix/ui/scroll-lock` is gone

`lockScroll` moved to `dist/popover/scroll-lock.js` and is **not publicly
reachable** — `@remix-run/ui`'s `popover` entry exports `{}`. Imported by
`app/components/layout/sidebar.component.js`; it was the single root cause of
all 9 initial test failures in the trial.

**Preferred fix — adopt `remix/ui/popover` for the mobile sidebar overlay.**
Its `surface` mixin calls `lockScroll()` internally and also covers
outside-click dismissal and focus restore, so this deletes the vendored helper
*and* most of the 107-line `sidebar.component.js` rather than porting it.

**Fallback:** if popover turns out not to fit the sidebar's layout, vendor the
~50 self-contained lines as `app/lib/scroll-lock.js`, again with an upstream
link, and revisit at GA.

### 7. Client `resolveFrame` signature changed — so delete ours

```ts
// beta.0
type ResolveFrame = (src, signal?, target?) => …

// rc.2
type ResolveFrame = (src, options?: { target, formData, method, encType, signal }) => …
```

`app/entry.js` passes `signal` **positionally** as the second argument, so it
would silently receive an options object. Plain JS, browser-only — neither the
typechecker nor the test suite catches this. It is the highest-risk item here.

In rc.2 `resolveFrame` is **optional**, and the built-in default fetches the
frame source as HTML with the submitted form data, method, encoding and abort
signal — a superset of our hand-rolled GET-only version. It can also return a
`Response` directly (`FrameResolution`).

**Delete the custom `resolveFrame` from `app/entry.js`** and let the default
handle it. This removes the break and gains form-submission support in one
edit. `loadModule` is still required and stays.

### 8. Smaller items

- `RenderFn<Props>` → `RenderFn` (zero-arg). We already use `return () => …`, so no change.
- `handle.update()` now throws if called during render/before first commit. **Not used** in this repo.
- Server-side `resolveFrame` in `RenderToStreamOptions` is **unchanged**; all 5 server call sites take only `(source)` and are safe.
- `remix/data-schema` is unchanged (`0.3.0` both sides) — all 14 schema imports are safe.
- Removed UI subpaths we do not use: `glyph`, `separator`, `theme`.

## Staged plan

Each stage should land green (`npm run check && npm run typecheck && npm test`).
Stages 1–4 are the compulsory migration; Stages 5–7 are the deletions, and are
where the value is.

**Stage 1 — bump and rename.** Move `package.json` to `remix@3.0.0-rc.2`,
reinstall, apply the nine specifier renames from §1.

**Stage 2 — router and context.** Introduce `appMiddleware` via
`createMiddleware`, collapse the dev/prod ternary, rewrite
`app/lib/request-context.ts` to `MiddlewareContext<typeof appMiddleware>`, drop
the `as unknown as Middleware` cast, add the `Session` undefined guard.

**Stage 3 — `href` call sites.** Nest the 9 search-param objects under
`searchParams`. Typecheck reaches zero here.

**Stage 4 — unblock the client runtime.** Delete the custom `resolveFrame` from
`app/entry.js` (§7). Cover the two removed helpers well enough to get the suite
green — by adopting the replacement where it is quick, or by vendoring with an
upstream link where it is not. Update the import map and the `remixRuntime`
static allowlist in `app/router.ts`; the current entries point at
`@remix-run/ui/dist/utils/scroll-lock.js`, which no longer exists.

At this point the app is on rc.2 and green. **Ship it, then continue** — the
remaining stages are independently valuable and independently revertible.

**Stage 5 — plumbing deletions (low risk, no visual change).**
`app/components/render.ts` → `render()` middleware and `context.render()`;
`IMPORT_MAP` + `remixRuntime` allowlist → `ImportMap` and `AssetServer`;
`app/lib/form-data-payload.ts` → `remix/data-schema/form-data`. Each is
self-contained and testable.

**Stage 6 — behavioral deletions via primitives (medium risk, no visual change
if done right).** Sidebar overlay → `remix/ui/popover`; tabs-nav →
`remix/ui/tabs/primitives`; theme-toggle → `remix/ui/toggle/primitives`;
select-input → `remix/ui/select/primitives`. Take one component per PR and keep
the Tailwind classes as they are — only the behavior moves. This is where the
vendored helpers from Stage 4 should disappear.

**Stage 7 — evaluate the styled components and dev tooling.** `remix/ui/button`
and `remix/ui/input` bring their own CSS, so they need a design-system decision
rather than a straight swap; measure them against `submit-button.tsx` and the
three input components before committing. Separately, assess
`remix/node-hmr` + `remix/ui-hmr` + `remix/ui/dev/refresh` against the current
`tsx watch` loop, and `remix/node-tsx` against the direct `tsx` dependency.

**Throughout — tests.** Replace the brittle source-text assertions
(`assert.match(body, /addEventListeners/)`, the import-map regexes in
`sidebar.test.ts`) with real render tests via `render()` from `remix/ui/test`.
Those assertions are themselves hand-rolled testing, they are the 3 failures in
the trial, and they will keep breaking on every adoption step until replaced.

**Manual browser pass — non-negotiable, after Stage 4 and again after Stage 6.**
The riskiest changes (`entry.js`, the client islands, the import map) are
invisible to both the typechecker and the test suite. Exercise: sidebar
open/close on mobile including scroll lock, theme toggle, locale select, every
`<Frame>` fragment (portfolio, guidelines, catalog list, catalog ETF analysis,
advice result), form submission via `FrameSubmitEnhancement`, and navigation
loading states. Verify in Firefox or Safari too — `app/entry.js` carries a
`window.navigation` stub for non-Chromium browsers.

## Risks

**Highest — untyped client code.** §5, §6 and §7 all live in `.js` files that
`tsconfig.json` does not include. Two of the three fail loudly at import time;
the `resolveFrame` signature change fails **silently and only in a browser**.
The manual pass is the only thing standing between that and a production
regression.

**Adoption is bigger than the migration.** Stages 5–7 touch far more code than
Stages 1–4 and carry real UI-regression risk. Keep them out of the version-bump
PR, and do them one component at a time — a broken tabs implementation is much
harder to spot in review than a broken import specifier.

**Primitives may not cover every case.** The inventory is based on reading the
rc.2 type surface, not on porting each component. Expect at least one of the
four Stage 6 targets to need behavior the primitives do not expose; treat the
table as candidates to evaluate, not a guaranteed deletion list.

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

1. **Timing.** rc.2 is not GA. Land Stages 1–4 now for a small diff and early
   warning of API churn, or wait for 3.0.0 final? This plan assumes now, and the
   validated 23-file diff supports that.
2. **Dev/prod middleware.** Accept compression-in-dev and logging-in-prod, or
   invest in a different structure that keeps them conditional under the new
   context typing?
3. **Styled components vs the Tailwind design system.** Primitives are the clear
   default. But `remix/ui/button` and `remix/ui/input` have no primitives-only
   variant, so adopting them means accepting Remix's CSS alongside Tailwind, or
   skipping them. Which way for Stage 7?
4. **Dev tooling.** Is replacing the `tsx` dev loop with `remix/node-hmr` worth
   the churn, given `tsx watch` works today? Deleting a direct dependency in
   favour of a first-party one fits the AGENTS.md rule, but this is the least
   urgent item in the plan.
