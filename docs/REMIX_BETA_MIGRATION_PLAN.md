# Remix beta migration plan

This is the working checklist for moving this app from
`remix@3.0.0-alpha.4` to the Remix beta line. **Progress:** prompts 1–4 are
complete in the repo; remaining items start at Prompt 5.

Sources to check before each implementation step:

- Remix API docs: <https://api.remix.run/>
- Remix package changelog:
  <https://github.com/remix-run/remix/blob/main/packages/remix/CHANGELOG.md>
- Remix UI changelog:
  <https://github.com/remix-run/remix/blob/main/packages/ui/CHANGELOG.md>
- Remix UI README:
  <https://github.com/remix-run/remix/blob/main/packages/ui/README.md>

## Current app baseline

- App dependency: `remix@^3.0.0-beta.0`
- Locked version: `remix@3.0.0-beta.0` (see `package-lock.json`)
- Locked UI runtime package: `@remix-run/ui@0.1.1` (peer of `remix`; served from `node_modules/@remix-run/ui/dist/`)
- JSX import source: `remix/ui` (`tsconfig.json`)
- Server rendering imports: `remix/ui/server`
- JSX runtime imports: `remix/ui/jsx-runtime`
- Static runtime allowlist: `remix/dist/ui.js` and paths under `@remix-run/ui/dist/` (`app/router.ts`)

The app already uses Remix for routing, sessions, form data, method override,
compression, static files, data schema, redirects, HTML responses, and
server-rendered JSX UI.

## What changed from alpha.4 to beta.0

### Deprecated or removed

| Old API/package | Status in beta | Replacement |
|---|---|---|
| `remix/component` | Removed | `remix/ui` |
| `remix/component/server` | Removed | `remix/ui/server` |
| `remix/component/jsx-runtime` | Removed | `remix/ui/jsx-runtime` |
| `remix/component/jsx-dev-runtime` | Removed | `remix/ui/jsx-dev-runtime` |
| `@remix-run/component` | Deprecated/consolidated | `@remix-run/ui` via `remix/ui` exports |
| Special `setup` argument for components | Removed | Pass those values as normal props and read `handle.props` |
| Render callback props, e.g. `return (props) => ...` | Removed | `return () => ...` and read `handle.props` |
| `keysEvents`, `pressEvents`, `PressEvent` | Removed | `on(...)` with native DOM keyboard, pointer, and click events |
| `@remix-run/ui/on-outside-pointer-down` | Removed | Use popover, menu, or component-level outside interaction APIs |
| `remix-test` binary | Removed in beta.0 | `remix/test/cli` |

### New or changed UI packages

| Beta export | Purpose | Migration relevance |
|---|---|---|
| `remix/ui` | Main UI runtime: components, hydration, Frames, navigation, mixins, theme helpers | Replace all `remix/component` imports |
| `remix/ui/server` | Server rendering for UI trees and Frames | Replace `remix/component/server` |
| `remix/ui/jsx-runtime` | JSX runtime | Update `tsconfig.json` `jsxImportSource` and direct JSX runtime imports |
| `remix/ui/jsx-dev-runtime` | JSX dev runtime | Update if used directly |
| `remix/ui/animation` | Animation helpers | Candidate for later UI polish, not required for the first upgrade |
| `remix/ui/accordion` | First-party accordion primitives | Candidate replacement for custom accordion/details wrappers if we add them |
| `remix/ui/anchor` | First-party link/anchor primitives | Candidate replacement for custom loading/navigation links |
| `remix/ui/breadcrumbs` | Breadcrumb primitives | Candidate if we add breadcrumb navigation |
| `remix/ui/button` | First-party button components | Candidate replacement for `SubmitButton` and other custom button wrappers |
| `remix/ui/combobox` | Combobox primitives | Candidate for richer searchable selects |
| `remix/ui/glyph` | Icon/glyph primitives | Candidate replacement for hand-authored repeated icons |
| `remix/ui/listbox` | Listbox primitives | Candidate for custom list/select-like controls |
| `remix/ui/menu` | Menu primitives | Candidate replacement for custom dropdown/menu behavior |
| `remix/ui/popover` | Popover primitives and outside interaction handling | Candidate replacement for custom popover/dialog-adjacent logic where appropriate |
| `remix/ui/scroll-lock` | Scroll locking helpers | Candidate for modal/sidebar overlay flows |
| `remix/ui/select` | Select primitives | Candidate replacement for custom select wrappers where it improves behavior |
| `remix/ui/separator` | Separator primitive | Candidate replacement for repeated divider markup |
| `remix/ui/theme` | Theme tokens and shared glyph sheets | Candidate for replacing scattered Tailwind-only design tokens over time |
| `remix/ui/test` | UI testing helpers | Candidate for Frame/component runtime tests |

### Other beta changes to remember

- `MultipartPart.headers` from `remix/multipart-parser` is now a plain object.
  Use `part.headers['content-type']`, not `part.headers.get('content-type')`.
- `remix/node-fetch-server/test`, `remix/node-serve`, `remix/terminal`, and
  `remix/test/cli` are added.
- Optional peer dependency metadata is added for feature-specific packages such
  as database drivers and Playwright.
- The Remix CLI package declares Node.js `24.3.0` or later.

## Migration strategy

Keep the migration small and easy to review:

1. Upgrade the package first.
2. Rename runtime imports.
3. Convert the component signature to `handle.props`.
4. Verify Frame/clientEntry behavior.
5. Then replace our custom UI wrappers with first-party `remix/ui/*`
   components in small batches.

Do not combine the runtime upgrade and broad UI redesign in one PR.

## Custom UI replacement targets

After the app compiles on beta, audit these app-owned UI pieces and decide which
ones should become first-party Remix UI components:

| Current area | Likely beta package to evaluate | Notes |
|---|---|---|
| `SubmitButton` and button-like wrappers | `remix/ui/button` | Start here because buttons are used across forms |
| Sidebar/app navigation links with loading behavior | `remix/ui/anchor`, `link(...)`, `navigate(...)` | Keep full-document links where intended |
| Dropdown/menu-like interactions | `remix/ui/menu`, `remix/ui/popover` | Replace only if behavior matches our accessibility needs |
| Dialog/popover-adjacent outside-click logic | `remix/ui/popover`, `remix/ui/scroll-lock` | Useful for cleanup around global listeners and overlays |
| Select/list controls | `remix/ui/select`, `remix/ui/listbox`, `remix/ui/combobox` | Do after buttons/navigation because forms are broader |
| Repeated separators/icons/theme tokens | `remix/ui/separator`, `remix/ui/glyph`, `remix/ui/theme` | Good cleanup after behavior-critical work |

Keep Tailwind utility styling unless a first-party Remix UI component makes the
same result simpler and more accessible.

## Remix UI theme bridge (shell chrome)

**Baseline:** `DocumentShell` renders **`RMX_01.Style`** from `remix/ui/theme` first in
`<head>`, so Remix injects the **`RMX_01`** CSS variable sheet plus the small global
reset (box model, `body` font/color/background via `var(--rmx-…)`, zeroed heading
margins, etc.). Tailwind’s **Preflight is disabled** (`corePlugins.preflight: false`
in `tailwind-config.ts`) so we do not stack two competing global resets.

**Semantic bridge:** `app/lib/remix-ui-theme-bridge.ts` is still merged into the
Tailwind `@layer base` stylesheet **after** the RMX preset, so `:root` **`--rmx-*`**
values are overridden to reference the same **`--background` / `--foreground` /
`--primary`** HSL channels Tailwind utilities use. That keeps **light/dark** and
**`remix/ui/button`** surfaces aligned without maintaining two separate palettes.

**Layout CSS:** `#page-content` uses a single **`shell-main`** class (padding + `md`
sidebar offset) defined in `document-styles.ts` instead of ad-hoc Tailwind layout
utilities—more shell layout can migrate the same way over time.

**Shell `Button` usage:** `ThemeToggleButton`, mobile sidebar open/close, and sidebar
**Sign out** use `remix/ui/button` (`tone="ghost"`) with mixes in
`app/components/chrome/shell-remix-toolbar-mix.ts`. **`SubmitButton`** stays native
for the busy-overlay contract.

**Trade-offs:** Remix `Button` keeps its pill `border-radius` token; icon-only rows
zero `--rmx-button-label-padding-inline` via `mix`. **Migration note:** Prompt 8
should record that **Tailwind Preflight is off**—any new raw HTML that relied on
Preflight normalization may need explicit classes or small `@layer base` rules.

**Prior note superseded:** We previously avoided `RMX_01.Style` to prevent fighting
Tailwind; with Preflight disabled and the bridge in place, both stacks cooperate.

## Separate-chat implementation prompts

Run these prompts one by one in separate chats. Each checkbox should produce a
small PR or a clear follow-up note before moving to the next item.

- [x] **Prompt 1 — Upgrade package metadata**

  ```text
  Start the Remix beta migration. Read AGENTS.md, docs/REMIX_V3_PACKAGES.md, docs/UI_ARCHITECTURE_GUIDELINES.md, docs/BIOME_RULES.md, and docs/REMIX_BETA_MIGRATION_PLAN.md.

  Goal: upgrade package.json and package-lock.json from remix@3.0.0-alpha.4 to the current Remix beta.

  Keep it small:
  - Update only package metadata and lockfile content.
  - Do not change app source code.
  - Summarize the exact changelog range from alpha.4 to the installed beta.

  Verify:
  - Run npm run typecheck and npm run test if available.
  - If checks fail because source code still imports removed beta exports, report the first failures and stop.

  Deliverable: one package-only PR.
  ```

- [x] **Prompt 2 — Rename removed UI runtime imports**

  ```text
  Continue after the Remix beta package upgrade.

  Goal: replace removed alpha UI runtime imports with beta imports.

  Change:
  - remix/component -> remix/ui
  - remix/component/server -> remix/ui/server
  - remix/component/jsx-runtime -> remix/ui/jsx-runtime
  - remix/component/jsx-dev-runtime -> remix/ui/jsx-dev-runtime, if present
  - tsconfig.json jsxImportSource
  - static/runtime allowlists that mention @remix-run/component

  Keep it small:
  - Do not convert component signatures yet unless TypeScript cannot progress without a tiny edit.
  - Record remaining errors for the next prompt.

  Verify with npm run typecheck and npm run test.

  Deliverable: one import-path PR.
  ```

- [x] **Prompt 3 — Convert components to `handle.props`**

  ```text
  Continue after imports point at remix/ui.

  Goal: convert components from the alpha `(handle, setup) => (props) => JSX` shape to the beta `Handle<Props>` plus `handle.props` shape.

  Work slowly:
  - Start with app/components/.
  - Then convert one app/features/* directory at a time.
  - Remove `_setup?: unknown`.
  - Move render callback prop reads to `handle.props`.
  - Turn setup values into normal props.
  - Export one props type for each component boundary used by controllers or tests.

  Do not refactor business logic or styling.

  Verify with npm run typecheck after each directory and npm run test after the full conversion.

  Deliverable: one or more small PRs, split by directory if needed.
  ```

- [x] **Prompt 4 — Verify Frame and clientEntry runtime behavior**

  ```text
  Continue after the app typechecks with remix/ui and handle.props.

  Goal: verify beta runtime behavior for Frame, clientEntry, navigation, hydration, and server rendering.

  Check:
  - app/entry.js
  - DocumentShell
  - render()
  - FrameSubmitEnhancement
  - catalog import/filter/list/detail analysis flows
  - portfolio add/update flows
  - guidelines add/update/delete flows
  - advice analysis Frame flows
  - non-blocking Frame SSR fallback/loading behavior from PR #133
  - static middleware for beta UI runtime assets

  Fix only beta runtime issues.

  Verify with npm run typecheck, npm run test, npm run check, and manual browser checks if practical.

  Deliverable: one runtime-fix PR plus any manual verification notes.
  ```

### Prompt 4 verification notes (automated)

Recorded when closing Prompt 4 in the repo:

- **`npm run typecheck`**, **`npm run test`**, and **`npm run check`** all pass.
- **`app/entry.js`** — Client `run()` from `remix/ui` with dynamic `loadModule` and `resolveFrame` (`fetch` + `Accept: text/html`); inert `globalThis.navigation` stub when the Navigation API is missing (Firefox/Safari) so `run()` does not throw before hydration.
- **`document-shell.tsx`** — Import map exposes `remix/ui` and `@remix-run/ui` to the served bundle URLs; shell mounts shared `clientEntry` islands including **`FrameSubmitEnhancement`**.
- **`app/components/render.ts`** — Forwards controller-provided **`resolveFrame`** into **`renderToStream`** when present (same contract as client `resolveFrame`).
- **`frame-submit.component.js`** — Imports **`navigate`** from **`remix/ui`**; catalog GET filter path uses named frame **`src` + `reload()` + `history.replaceState`** with **`navigate` / `location.assign` fallbacks** as documented.
- **`app/router.ts`** — **`staticFiles`** for `node_modules` allows **`remix/dist/ui.js`** and **`@remix-run/ui/dist/**`** so the browser import map resolves.
- **Frame SSR / fallback** — **`frameLoadingPlaceholder`** documents non-blocking `<Frame fallback={…}>` streaming behavior where used.
- **Multipart beta note** — No direct **`remix/multipart-parser`** / **`MultipartPart.headers`** usage in app code; nothing to migrate for plain-object headers in this codebase.

**Manual browser exercise** (catalog filter, portfolio/guidelines frames, advice result frame, catalog ETF analysis) was not run in the agent environment; run a quick smoke pass locally if desired.

- [ ] **Prompt 5 — Replace custom buttons first**

  ```text
  Start replacing app-owned UI wrappers with first-party Remix UI components.

  Goal: evaluate remix/ui/button and replace our simplest custom button wrappers where it clearly improves consistency without changing product behavior.

  Scope:
  - Inspect SubmitButton and other shared button-like components.
  - Replace only the low-risk shared button primitives in this PR.
  - Keep form behavior, loading states, labels, and Tailwind styling equivalent.
  - If remix/ui/button does not fit a case, document why and leave it unchanged.

  Verify with focused form tests, npm run typecheck, and npm run check.

  Deliverable: one small button-focused PR.
  ```

- [ ] **Prompt 6 — Replace navigation/menu/popover pieces**

  ```text
  Continue the Remix UI component adoption.

  Goal: evaluate remix/ui/anchor, remix/ui/menu, remix/ui/popover, and remix/ui/scroll-lock for our navigation, menus, popovers, dialogs, and overlay behavior.

  Scope:
  - Audit sidebar navigation, loading links, menu/dropdown-like interactions, dialog outside-click behavior, and overlay scroll locking.
  - Replace only pieces where the Remix UI primitive matches our full-document vs Frame-navigation intent.
  - Keep full-page navigation as full-page navigation where that is intentional.
  - Avoid broad visual redesign.

  Verify with focused interaction tests and manual browser checks where possible.

  Deliverable: one or more small PRs split by interaction area.
  ```

- [ ] **Prompt 7 — Replace select/listbox/combobox pieces**

  ```text
  Continue the Remix UI component adoption after buttons and navigation.

  Goal: evaluate remix/ui/select, remix/ui/listbox, and remix/ui/combobox for form controls that currently use custom wrappers.

  Scope:
  - Audit SelectInput and any listbox/combobox-like UI.
  - Replace only controls where Remix UI improves accessibility or reduces custom behavior.
  - Preserve names, form submission behavior, validation behavior, and server-rendered defaults.

  Verify with form tests, npm run typecheck, and npm run check.

  Deliverable: one small form-control PR.
  ```

- [ ] **Prompt 8 — Audit non-UI beta changes**

  ```text
  Finish the non-UI beta migration audit.

  Goal: check beta changelog items outside the UI runtime.

  Check:
  - Tailwind CDN runs with **Preflight disabled** (`tailwind-config.ts`); raw markup that assumed Preflight may need explicit utility or a small `@layer base` rule when touched.
  - remix/multipart-parser and MultipartPart.headers usage
  - remix-test usage
  - whether remix/assert, remix/test, remix/node-fetch-server/test, remix/auth, remix/auth-middleware, remix/cop-middleware, or remix/csrf-middleware should replace local helpers
  - whether data-table breaking changes affect the app
  - whether Node.js 24.3.0+ is documented for local development and CI

  Prefer audit notes over speculative refactors.

  Verify with npm run check and npm run test.

  Deliverable: one audit PR, or a docs-only note if no code changes are needed.
  ```

- [ ] **Prompt 9 — Final docs cleanup**

  ```text
  After all Remix beta migration PRs are merged, do a final documentation cleanup.

  Goal: make the docs describe beta as the current baseline.

  Update:
  - docs/REMIX_BETA_MIGRATION_PLAN.md checklist statuses
  - docs/REMIX_V3_PACKAGES.md "Version in use" and current usage tables
  - docs/UI_ARCHITECTURE_GUIDELINES.md
  - docs/FRAME_COMPONENT_MIGRATION_PLAN.md
  - any stale notes saying the app still imports remix/component

  Verify with git diff --check and npm run check if code/config changed.

  Deliverable: one docs cleanup PR.
  ```

## Decisions to make while migrating

- Do we replace only custom wrappers that map cleanly to `remix/ui/*`, or do we
  also adjust visual design to match Remix UI defaults?
- Should every beta component boundary export an explicit props type? The current
  plan says yes when controllers or tests build props for `jsx(Component, props)`.
- Does CI already run on Node.js `24.3.0` or later?
