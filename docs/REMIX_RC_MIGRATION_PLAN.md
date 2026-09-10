# Remix RC migration plan

Working checklist for moving this app from `remix@3.0.0-beta.0` to the newest
published Remix 3 build, **`3.0.0-rc.2`**.

## The goal

**Use Remix APIs wherever Remix has one. Keep hand-rolled code to the minimum.**

The version bump is the enabling step, not the objective. rc.2 closes most of
the gaps this app filled by hand while it was on beta.0, and the migration is
the moment to hand that code back to the framework. This restates AGENTS.md
("Maximize Remix package usage", "If you find code that a Remix package could
replace, refactor it") as the organizing principle of the whole plan.

**The decision rule, in both directions.** Adopting a Remix API is the default
and needs no justification. *Keeping* hand-rolled code is the exception and must
clear a stated bar, recorded in a comment where the code lives:

1. Remix ships nothing for it (for example i18n — see AGENTS.md), **or**
2. it is genuine app or domain logic (portfolio maths, advice generation, the
   MCP server, our Tailwind design tokens), **or**
3. the Remix API was tried against this codebase and demonstrably does not fit —
   with the specific gap named.

"We already wrote it", "ours works", and "the swap looked fiddly" are not
reasons. Neither is a guess that the API will not fit: reason 3 requires a real
attempt, not a prediction. Where a Remix API exists but is genuinely unusable
today, prefer the smallest possible vendored copy carrying an upstream link and
a deletion trigger, over a fresh hand-rolled design.

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
on a pre-release either way.

## Baseline

- Current: `remix@3.0.0-beta.0` (locked), `@remix-run/ui@0.1.1`
- Target: `remix@3.0.0-rc.2`, `@remix-run/ui@0.9.0`
- Surface: 170 TS/TSX files, ~29k LOC; 24 distinct `remix/*` import specifiers

The heaviest dependency move is `@remix-run/ui` **0.1.1 → 0.9.0** — eight 0.x
minors at once. That jump is what makes the deletions below possible.

Eleven runtime modules are **new in rc.2** and did not exist in beta.0:
`form-navigation`, `import-map-manager`, `module-preloader`, `frame-resolution`,
`document-reload`, `client-entry-boundary`, `refresh`, `spa-response`,
`element-function`, `event-types`, `key`. Several of them are direct native
replacements for code in `app/`.

## What Remix takes over

| Hand-rolled today | LOC | Replace with | Availability |
|---|---:|---|---|
| Form interception in `frame-submit.component.js` — `getSubmitControl`, `createFormData`, `buildGetNavigationUrl`, submitter detection | ~120 of 411 | Native `form-navigation` runtime | **New in rc.2** |
| `text-input` / `number-input` / `textarea-input` | 239 | `remix/ui/input` | **New in rc.2** |
| `tabs-nav.tsx` + `tabs-nav-scroll.component.js` | 202 | `remix/ui/tabs/primitives` | **New in rc.2** |
| Sidebar overlay: scroll lock, outside-click, focus restore | 107 | `remix/ui/popover` — `surface` does all three | Since beta.0 |
| `select-input.tsx` | 91 | `remix/ui/select/primitives` | **New in rc.2** |
| `theme-toggle.tsx` + `.component.js` | 76 | `remix/ui/toggle/primitives` | **New in rc.2** |
| `submit-button.tsx` + `submit-button-loading.component.js` | 151 | `remix/ui/button` | Since beta.0 |
| `app/components/render.ts` | 55 | `render()` from `remix/middleware/render` → `context.render(node, init)` | **New in rc.2** |
| `IMPORT_MAP` in `document-shell.tsx` + `remixRuntime` allowlist in `router.ts` | ~15 | `ImportMap` from `remix/ui/server`, backed by the native `import-map-manager`; `@remix-run/assets` `AssetServer` | **New in rc.2** |
| Custom `resolveFrame` in `app/entry.js` | ~10 | Built-in default resolver | **New in rc.2** |
| `app/lib/form-data-payload.ts` | 11 | `remix/data-schema/form-data` | Since beta.0 — its comment ("there is no separate parser") is simply wrong |
| Hand-written `AppRequestContext` | 11 | `MiddlewareContext<typeof appMiddleware>` | **New in rc.2** (also compulsory — see §2) |
| `tsx watch` dev loop | — | `remix/node-hmr` + `remix/ui-hmr` + `remix/ui/dev/refresh` | **New in rc.2** |
| Direct `tsx` dependency | — | `remix/node-tsx` (oxc-based loader, already a transitive dep) | **New in rc.2** |
| Source-text assertions (`assert.match(body, /addEventListeners/)`) | — | `render()` from `remix/ui/test` — but it mounts into `document.body`, so it needs a DOM this repo does not have (see Stage 6) | Since beta.0 |

Roughly **1,100 LOC of hand-rolled code has a Remix owner**, before the
dev-tooling swaps.

### Use the `/primitives` exports, not the styled components

rc.2 ships each control twice, and for a Tailwind app the difference decides the
approach:

| Export | CSS references in `dist` | What you get |
|---|---:|---|
| `remix/ui/tabs` | 6 | Behavior **and** Remix's own styling |
| `remix/ui/tabs/primitives` | **0** | Behavior only — context, registration, keyboard activation, events |
| `remix/ui/toggle` | 2 | Styled |
| `remix/ui/toggle/primitives` | **0** | Behavior only |
| `remix/ui/select` | 3 | Styled |
| `remix/ui/select/primitives` | **0** | Behavior only |

The app has a committed Tailwind design system (`tailwindConfig`, `baseCss`,
shadcn-style tokens). Primitives let us delete the hard part — keyboard
navigation, ARIA wiring, focus management, roving tabindex, event plumbing —
while keeping every Tailwind class. Default to primitives; take a styled
component where we have no styling opinion.

`remix/ui/popover` is the same idea for the sidebar: `surface`, `anchor`,
`focusOnShow`/`focusOnHide` and `onOutsideClick` are mixins rather than a visual
component, and `surface` calls `lockScroll()` internally.

`remix/ui/button` and `remix/ui/input` have **no** primitives-only variant, so
they are the one place the rule meets real friction — see Open question 2. Note
they are still **mixin factories**, not components: `button()` and `input()`
return mixin descriptors you apply to your own `<button>` / `<input>`, so the
friction is CSS arriving per element, not a component swap.

### What should still be hand-rolled afterwards

The intended end state, so "minimum" is a target and not a vibe. These clear the
bar in §Goal:

- **Domain and app logic** — the portfolio, guidelines, advice and catalog
  features; the MCP server; gist persistence. (Reason 2.)
- **i18n** — `t()` / `format()` and the locale maps. Remix ships no i18n
  package; AGENTS.md already records this. (Reason 1.)
- **App-specific middleware** — `uiLocaleMiddleware`, `multipartLimitFlashOnError`,
  `enforceGithubApproval`. These stay, but as thin middleware built on Remix's
  own middleware contract, not as bespoke plumbing. (Reason 2.)
- **Design system** — `tailwindConfig`, `baseCss`, `form-control-classes.ts`,
  and the presentational wrappers that carry only Tailwind classes. (Reason 2.)
- **App-specific UX inside `frame-submit.component.js`** — inline banner tones,
  `#ui-client-messages` reading, dialog closing, submit-button loading. The form
  *mechanics* go to the runtime; this layer stays and gets smaller. (Reason 2.)
- **Document-level event delegation, if anything still needs it after Stage 6.**
  `on()` is an element mixin and does not cover it. (Reason 3 — but the bar
  requires proving a call site survives the primitives, not assuming it does.)

## Validation already performed

A full trial migration was run in a scratch copy of the repo against a real
`remix@3.0.0-rc.2` install:

| Stage | Result |
|---|---|
| rc.2 installed, no code changes | 20 typecheck errors (all cascading from 9 missing module specifiers) |
| after specifier renames | 12 errors, in 4 real clusters |
| after context + router refactor | 6 errors |
| after `href` + `Session` fixes | **0 typecheck errors** |
| test suite, after covering the two removed helpers | **566 / 569 passing** |

Baseline on current beta.0: **569 passing, 0 failing.** Trial diff: **23 files.**

The 3 remaining failures are all in `app/components/layout/sidebar.test.ts` and
assert the *old* import-map contract this migration deliberately changes.

**Scope of what this proves.** The trial took the shortest path to green to size
the compulsory work. It did **not** perform the adoptions in the table above —
those are Stages 5–7, and they are sized by reading the rc.2 type surface, not
by porting. Treat the table as candidates with a strong prior, and expect at
least one to need behavior the primitives do not expose. That is what reason 3
in the decision rule is for.

## Breaking changes

### 1. Module specifiers renamed (mechanical, 12 file-touches)

Middleware moved under `remix/middleware/*`; the router split into
`remix/router` + `remix/routes`. Underlying `dist/` filenames are unchanged, so
this is a pure specifier swap.

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

`ContextEntry` changed from a **tuple** to an **object**:

```ts
// beta.0
type ContextEntry = readonly [key, value]

// rc.2
interface ContextEntry { key; value; property? }
```

`MergeContext`, `SetContextValue`, `WithParams`, `BuildAction`,
`ApplyMiddleware*` and `MiddlewareContextTransform` were **removed**;
`ContextWithEntries`, `ContextWithEntry`, `ContextWithParams`, `RouterTypes`,
`createMiddleware`, `createAction` and `createController` were added.

Middleware now carry their context contribution in the type system, and the
router threads the composed shape through to every controller — `logger()`
contributes `{ key, value, property: 'logger' }`. A hand-written
`AppRequestContext` listing only `FormData` and `Session` no longer matches, so
**every** `router.map(...)` fails to typecheck.

The fix is itself a deletion — stop hand-maintaining the type, derive it:

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

This cleared all 12 router errors in the trial and lets the
`as unknown as Middleware` cast in `enforceGithubApproval()` go away.

**Consequence — the dev/prod middleware ternary must go.** `logger()` in dev and
`compression()` in prod now produce *different context types*, so the ternary
yields a union the router rejects. The trial ran both in both environments (one
stable tuple). That is a real behavior change: compression in dev, logging in
prod. See Open question 1.

### 3. `context.get()` can now return `undefined`

Context reads include `undefined` when the key has no default.
`app/lib/multipart-limit-flash-middleware.ts` needs a guard after
`context.get(Session)` even though it calls `context.has(Session)` — `has()`
does not narrow.

### 4. `href()` search params must nest under `searchParams`

`route-pattern` 0.20.1 → 0.24.0:

```ts
// before
routes.advice.index.href({}, { tab: 'buy_next' })

// after
routes.advice.index.href({}, { searchParams: { tab: 'buy_next' } })
```

9 call sites across advice, guidelines and catalog. A **silent trap**: the old
shape still typechecks in some positions but drops the query string, so check
all 9 by hand as well as by compiler.

### 5. `addEventListeners` was removed from `@remix-run/ui`

Used in **8 client components**. These are `.js` files outside `tsconfig.json`'s
`include`, so **typecheck will not catch it** — it fails at module link time
with `SyntaxError: does not provide an export named 'addEventListeners'`.

**Fix by deleting the call sites, not by porting them.** Nearly all of them
hand-roll behavior rc.2 now ships:

| Call site | Replacement |
|---|---|
| `tabs-nav-scroll.component.js` | `remix/ui/tabs/primitives` |
| `theme-toggle.component.js` | `remix/ui/toggle/primitives` |
| `sidebar.component.js` | `remix/ui/popover` (`onOutsideClick`, `surface`) |
| `locale-select.component.js` | `remix/ui/select/primitives` |
| `frame-submit.component.js` | native `form-navigation` runtime (§7) |
| `guidelines-list.component.js`, `catalog-etf-back.component.js`, `portfolio-trade-focus.component.js` | `on()` mixin where element-scoped |

Only if a call site survives that pass — proven, not assumed — vendor the
removed helper as `app/lib/event-listeners.js`: ~25 self-contained lines over
native `addEventListener(type, handler, { signal })` plus a re-entry
`AbortController`. Header must carry the upstream link and a note to delete it
when Remix re-exports an equivalent.

### 6. `remix/ui/scroll-lock` is gone

`lockScroll` moved to `dist/popover/scroll-lock.js` and is **not publicly
reachable** — `@remix-run/ui`'s `popover` entry exports `{}`. Imported by
`sidebar.component.js`; it was the single root cause of all 9 initial test
failures in the trial.

**Adopt `remix/ui/popover` for the mobile sidebar overlay.** Its `surface` mixin
calls `lockScroll()` internally and also covers outside-click dismissal and
focus restore, deleting most of the 107-line `sidebar.component.js` rather than
porting it. Vendor the ~50-line helper only if popover is tried and does not fit
the sidebar's layout, with the gap named per reason 3.

### 7. Client `resolveFrame` changed — and form handling went native

```ts
// beta.0
type ResolveFrame = (src, signal?, target?) => …

// rc.2
type ResolveFrame = (src, options?: { target, formData, method, encType, signal }) => …
```

`app/entry.js` passes `signal` **positionally**, so it would silently receive an
options object. Plain JS, browser-only — neither the typechecker nor the tests
catch this. It is the highest-risk item in the migration.

`resolveFrame` is now **optional**: the built-in default fetches the frame source
as HTML with the submitted form data, method, encoding and abort signal, and can
return a `Response` directly. **Delete the custom `resolveFrame`** — the removal
both fixes the break and gains form-submission support. `loadModule` stays.

Behind that default, rc.2 adds a `form-navigation` runtime module that tracks
native `submit` events, resolves the authoritative submitter, and feeds
method/encType/formData into frame reloads — including the Chromium case where a
submitter overrides a non-POST form. `frame-submit.component.js` hand-rolls
exactly this in `getSubmitControl`, `createFormData` and `buildGetNavigationUrl`.
Those go; the app-specific UX around them stays (see *What should still be
hand-rolled*).

### 8. Smaller items

- `RenderFn<Props>` → `RenderFn` (zero-arg). We already use `return () => …`.
- `handle.update()` now throws if called during render/before first commit. **Not used** here.
- Server-side `resolveFrame` in `RenderToStreamOptions` is **unchanged**; all 5 server call sites take only `(source)`.
- `remix/data-schema` is unchanged (`0.3.0` both sides) — all 14 schema imports are safe.
- Removed UI subpaths we do not use: `glyph`, `separator`, `theme`.

## Staged plan

Each stage lands green (`npm run check && npm run typecheck && npm test`).
Stages 1–4 are compulsory; Stages 5–7 are the adoption work the goal is about.

**Stage 1 — bump and rename.** `remix@3.0.0-rc.2`, reinstall, apply the nine
specifier renames.

**Stage 2 — router and context.** `appMiddleware` via `createMiddleware`,
collapse the dev/prod ternary, derive `AppRequestContext`, drop the
`as unknown as Middleware` cast, add the `Session` guard.

**Stage 3 — `href` call sites.** Nest the 9 search-param objects. Typecheck
reaches zero.

**Stage 4 — unblock the client runtime.** Delete the custom `resolveFrame`
(§7). Get the suite green on the two removed helpers — by adopting the
replacement where it is quick, or by vendoring with an upstream link and a
deletion trigger where it is not. Update the import map and the `remixRuntime`
allowlist in `app/router.ts`; the current entries point at
`@remix-run/ui/dist/utils/scroll-lock.js`, which no longer exists.

At this point the app is on rc.2 and green. **Ship it, then keep going** — the
remaining stages are where the hand-rolled code actually goes away, and each is
independently valuable and revertible.

**Stage 5 — plumbing (low risk, no visual change). Done**, with one item
kept under Reason 3:

- `render.ts` → `render()` middleware and `context.render()`. Adopted for
  every page render *except* the five call sites that pass a per-render
  `resolveFrame` (advice, two in catalog, guidelines, portfolio) — those
  short-circuit a known `<Frame>` src to data the render already computed
  (advice/ETF analysis), avoiding a second in-process request. The
  `render()` middleware's `RenderFunction` (`context.render`) has no
  per-call `resolveFrame` hook, so those five keep calling `renderToStream`
  directly; `render.ts` now takes `context` and branches on whether
  `options.resolveFrame` is given. Named gap, Reason 3.
- `IMPORT_MAP` in `document-shell.tsx` + `remixRuntime` allowlist in
  `router.ts` → `ImportMap` from `remix/ui/server`, backed by a minimal
  `createAssetServer({ allowPackages: ['remix'] })` in
  `app/lib/remix-assets.ts`. **Not** via `getImportMap()`/`getScriptEntry()`
  as the table implied — tried, and it doesn't fit: both key their mappings
  to a `scopes` entry for the *importing module's own served URL* (assuming
  that module is itself served by the same asset server), so they only
  resolve for pages the asset server serves. Our `.component.js`/`entry.js`
  files stay on `staticFiles()` — already-built plain JS at stable
  root-relative paths, with root-relative `clientEntry()` ids rather than
  `import.meta.url`/`file:` ones, so `render()`'s `resolveClientEntry` never
  needs the asset server for them either — and a scoped map never applies to
  a module loaded from outside the asset server's own URL namespace.
  Demonstrated against this codebase, Reason 3 on the *mechanism*; the
  simpler `getHref()` per package file, assembled into a flat top-level
  `imports` map by hand, gives the same win (no hand-maintained dist path
  that can drift across upgrades) without the scoping mismatch.
- `form-data-payload.ts` → **kept, Reason 3.** `remix/data-schema/form-data`
  parses `FormData` directly via a schema (`object()`/`field()`), but every
  call site here (guidelines ×3, portfolio, advice, locale) runs
  app-specific normalization — locale-decimal parsing, defaulting blank
  fields, mapping raw multi-field combinations — on a plain object *before*
  `parseSafe()`, and the schema-first API has no hook for that step. Moving
  it in would mean rewriting five schemas' worth of validation logic, which
  is bigger than a "no visual change" plumbing stage and belongs, if
  pursued, in its own reviewed change. `objectFromFormData`'s job (produce
  the plain object those normalizers mutate) stays; its comment is
  corrected to say why rather than claim no parser exists.

**Stage 6 — behavior via primitives (medium risk, no visual change if done
right). In progress.** Sidebar → `remix/ui/popover`; tabs-nav →
`tabs/primitives`; theme-toggle → `toggle/primitives`; locale-select and
select-input → `select/primitives`; `frame-submit.component.js` form mechanics
→ native `form-navigation`. One component per PR, Tailwind classes untouched —
only behavior moves. Any vendored helper from Stage 4 should be deleted here; if
one survives, record which call site needed it and why.

*The shape of the work, learned on the first component.* Every island in this
app is a hidden `<span>` that delegates `click` from `document`, while the
markup lives in a separate server component. Remix UI primitives are **element
mixins** bound to the handle of the component that rendered the element, so
none of them can attach to that shape: adopting one means folding the markup
into the `clientEntry` and passing translated copy in as props (the render
function also runs in the browser, where `t()` does not exist). That restructure
— not the primitive itself — is the actual cost of each item below, and it is
written up as pattern 8 in `docs/UI_ARCHITECTURE_GUIDELINES.md`. Each new
`remix/ui/*` specifier an entry imports also needs a `browserModulePaths` entry
in `app/lib/remix-assets.ts`, alongside the `@remix-run/ui/*` subpath it
re-exports.

- **theme-toggle → `toggle/primitives`. Done.** `theme-toggle.tsx` and
  `theme-toggle.component.js` collapse into one `clientEntry` whose `<button>`
  carries `toggle.control({ checked, onCheckedChange })`; every Tailwind class
  and both SVGs are byte-identical, and the entry gained `role="switch"`,
  `aria-checked` and `data-state` that the hand-rolled button never exposed.
  Third `addEventListeners` call site retired. Verified in Chromium (click,
  Space, `localStorage` round-trip, reload with `theme=light`, and a sweep of
  the four main pages): no hydration warning, no runtime error.
  One wrinkle, recorded in the component: the mixin hands the renderer a
  boolean `aria-checked`, which the server renderer streams as the bare
  attribute `aria-checked=""` — ARIA reads that as the `switch` default
  (`false`) until hydration rewrites it. Accepted; working around it would mean
  re-hand-rolling what the mixin owns.
- **Tests.** `render()` from `remix/ui/test` mounts into `document.body`, and
  nothing in this repo supplies a DOM — upstream drives it with Playwright,
  which is not a dependency here. Until that call is made, the replacement for
  the source-text assertions is a **server-render** assertion: render the entry
  with `renderToString` and assert the contract it emits (`role`,
  `data-state`, the `rmx-data` hydration record) instead of grepping the module
  source. `theme-toggle.test.ts` is the worked example.

**Stage 7 — styled components and dev tooling.** `remix/ui/button` and
`remix/ui/input` against `submit-button.tsx` and the three input components —
the design-system call in Open question 2. Then `remix/node-hmr` + `remix/ui-hmr`
+ `remix/ui/dev/refresh` against the `tsx watch` loop, and `remix/node-tsx`
against the direct `tsx` dependency.

**Throughout — tests.** Replace source-text assertions
(`assert.match(body, /addEventListeners/)`, the import-map regexes in
`sidebar.test.ts`) with real render tests. Those assertions are themselves
hand-rolled testing, they are the 3 trial failures, and they will keep breaking
on every adoption step until replaced. `render()` from `remix/ui/test` needs a
DOM this repo does not have (see Stage 6) — until that is resolved, assert the
server-rendered contract via `renderToString`.

**Manual browser pass — non-negotiable, after Stage 4 and again after Stage 6.**
The riskiest changes are invisible to typecheck and tests. Exercise: sidebar
open/close on mobile including scroll lock, theme toggle, locale select, every
`<Frame>` fragment (portfolio, guidelines, catalog list, catalog ETF analysis,
advice result), form submission via `FrameSubmitEnhancement`, and navigation
loading states. Check Firefox or Safari too — `app/entry.js` carries a
`window.navigation` stub for non-Chromium browsers.

## Risks

**Highest — untyped client code.** §5, §6 and §7 live in `.js` files
`tsconfig.json` does not include. Two fail loudly at import time; the
`resolveFrame` change fails **silently and only in a browser**. The manual pass
is the only thing between that and a production regression.

**Adoption is bigger than the migration.** Stages 5–7 touch far more code than
1–4 and carry real UI-regression risk. Keep them out of the version-bump PR and
go one component at a time — a broken tabs implementation is much harder to spot
in review than a broken import specifier. This is an argument about *sequencing*,
not about whether to adopt.

**The inventory is read, not proven.** Sized from the rc.2 type surface. Expect
at least one Stage 6 target to need behavior the primitives do not expose; when
that happens, name the gap and keep the hand-rolled code under reason 3.

**Behavior change from collapsing the middleware ternary.** Compression in dev
and logging in prod is a real change to both environments. Prefer tuning each
middleware's options over reintroducing a conditional chain — the conditional is
what the new context typing rejects.

**Still a pre-release.** rc.2 may be followed by rc.3 or further breaking changes
before GA. Re-run the trial-migration method against whatever is newest at
implementation time rather than trusting this document's version numbers.

**Node version.** `package.json` requires Node `>=24.3.0`, as does the Remix CLI.
Confirm CI and the Fly image satisfy it.

## Open questions

1. **Dev/prod middleware.** Accept compression-in-dev and logging-in-prod, or
   invest in a structure that keeps them conditional under the new context
   typing?
2. **Styled controls vs the Tailwind design system.** Primitives are the clear
   default, but `remix/ui/button` and `remix/ui/input` have no primitives-only
   variant — adopting them means accepting Remix's CSS alongside Tailwind
   (~390 LOC deleted), and skipping them means keeping hand-rolled controls
   under reason 2. This is the one place the goal and the design system genuinely
   pull against each other.

   Both are **mixin factories** in rc.2, not components: you keep your own
   `<button>` and its Tailwind classes and apply `button({ tone: 'ghost' })` to
   it. `ButtonTone` is `'neutral' | 'primary' | 'ghost'` and `ButtonSize` /
   `InputSize` are `'md' | 'lg'`. That makes this a per-element opt-in rather
   than an all-or-nothing swap, so it can be trialled on one control before
   committing.

   **Prior art — PR #150 (closed).** An earlier attempt at exactly this, on the
   beta.0 line. It mounted `RMX_01.Style` from `remix/ui/theme`, **disabled
   Tailwind Preflight** so the Remix reset owned global defaults, and added a
   46-line `--rmx-*` bridge remapping Remix's variables onto this app's HSL
   tokens. It was parked as too invasive. rc.2 has since removed the ground it
   stood on: `remix/ui/theme` and `RMX_01` are gone (along with `glyph`,
   `separator`, `scroll-lock`), `remix/ui/button` no longer exports a `Button`
   component, and `--rmx-button-label-padding-inline` no longer exists — rc.2's
   button reads only three `--rmx-*` variables, all shadow-related. So that
   branch is not revivable, but its lesson stands: **do not disable Preflight
   and do not build a variable bridge.** The mixin shape means neither is
   needed. Whoever picks this up should read #150's diff first to see what to
   avoid.
3. **Timing.** Land Stages 1–4 now for a small diff and early warning of API
   churn, or wait for 3.0.0 final? This plan assumes now; the validated 23-file
   diff supports it.
