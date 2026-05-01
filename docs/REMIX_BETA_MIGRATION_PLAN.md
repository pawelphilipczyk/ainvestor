# Remix beta migration plan

This document summarizes the migration from the repo's current
`remix@3.0.0-alpha.4` install to the Remix beta line, based on:

- Current repo metadata: `package.json` and `package-lock.json`
- Remix package changelog:
  <https://github.com/remix-run/remix/blob/main/packages/remix/CHANGELOG.md>
- Remix API docs site: <https://api.remix.run/>
- Remix GitHub repository: <https://github.com/remix-run/remix>

## Current repository baseline

- App dependency: `remix@^3.0.0-alpha.4`
- Locked version: `remix@3.0.0-alpha.4`
- Locked UI runtime package: `@remix-run/component@0.6.0`
- TypeScript JSX import source: `remix/component`
- Server rendering imports: `remix/component/server`
- JSX runtime imports: `remix/component/jsx-runtime`
- Static runtime allowlist includes `@remix-run/component/dist/`

The app is already fetch-router/server-first and uses Remix packages for
routing, sessions, form data, method override, compression, static files, data
schema, redirects, HTML responses, and server-rendered JSX UI.

## Changelog delta from alpha.4 to beta.0

### alpha.5

- Adds `remix/assert` and `remix/test` exports.
- Adds a `remix-test` binary.
- Bumps `@remix-run/component` from the alpha.4 line to `0.7.0`.
- Bumps fetch-router, form-data-middleware, method-override-middleware,
  route-pattern, session-middleware, static-middleware, and data-table adapters.

### alpha.6

- **Breaking:** `remix/component`, `remix/component/jsx-runtime`,
  `remix/component/jsx-dev-runtime`, and `remix/component/server` are removed.
  Use `remix/ui`, `remix/ui/jsx-runtime`, `remix/ui/jsx-dev-runtime`, and
  `remix/ui/server`.
- **Breaking:** `MultipartPart.headers` is now a plain object keyed by lower-case
  header name instead of a native `Headers` instance. Use
  `part.headers['content-type']`, not `part.headers.get('content-type')`.
- Adds `remix/cli`, `remix/terminal`, and `remix/test/cli` exports.
- Adds the `remix` binary and declares Node.js `24.3.0` or later in CLI package
  metadata.
- Introduces the consolidated UI runtime package as `@remix-run/ui@0.1.0`.

### beta.0

- Keeps the `remix/component` removal and consolidated `remix/ui` runtime.
- Removes the deprecated `remix-test` binary; use the beta test/CLI exports
  instead.
- Adds `remix/node-fetch-server/test`, `remix/node-serve`, `remix/terminal`,
  and `remix/test/cli` exports.
- Adds optional peer dependency metadata for feature-specific packages such as
  database drivers and Playwright.
- Bumps `@remix-run/ui` to `0.1.1`.

### UI runtime changelog highlights

The component package was consolidated into `@remix-run/ui`.

- Import component runtime APIs from `remix/ui`.
- Import server rendering APIs from `remix/ui/server`.
- Import JSX runtime APIs from `remix/ui/jsx-runtime` and
  `remix/ui/jsx-dev-runtime`.
- Import animation APIs from `remix/ui/animation`.
- Component functions now receive props through stable `handle.props`.
  The old `(handle, setup) => (props) => JSX` shape is replaced by
  `(handle) => () => JSX`, with props read from `handle.props`.
- The `setup` prop is no longer special. Values previously passed through
  setup should become normal component props.
- Deprecated `keysEvents`, `pressEvents`, and `PressEvent` exports are removed.
  Use `on(...)` with native keyboard, pointer, and click events.
- `@remix-run/ui@0.1.1` improves rendering performance and strips frame wrapper
  markup from server and client frame responses before rendering frame content.

## Migration steps

### 1. Prepare the runtime upgrade

- Ensure the development and CI environments provide Node.js `24.3.0` or later
  before adopting beta CLI workflows.
- Upgrade `remix` from `^3.0.0-alpha.4` to the beta version and refresh the
  lockfile.
- Run typecheck and tests immediately after the package update so import/export
  failures surface before behavior changes.

### 2. Rename component imports to the UI runtime

Change import paths mechanically first:

| Current | Beta |
|---|---|
| `remix/component` | `remix/ui` |
| `remix/component/server` | `remix/ui/server` |
| `remix/component/jsx-runtime` | `remix/ui/jsx-runtime` |
| `remix/component/jsx-dev-runtime` | `remix/ui/jsx-dev-runtime` |

Also update:

- `tsconfig.json` `jsxImportSource`
- runtime/static file allowlists that mention `@remix-run/component`
- docs and comments that describe `remix/component` as the current API

### 3. Convert component signatures to `handle.props`

The repo currently has many components shaped like:

```tsx
export function Example(_handle: Handle, _setup?: unknown) {
	return (props: ExampleProps) => <section>{props.title}</section>
}
```

The beta shape should be:

```tsx
export function Example(handle: Handle<ExampleProps>) {
	return () => <section>{handle.props.title}</section>
}
```

Plan this as a focused codemod/manual pass:

- Replace `_setup?: unknown` parameters.
- Move render callback props reads to `handle.props`.
- Convert any special `setup` usage into ordinary props.
- Revisit exported props type derivation. The old
  `Parameters<ReturnType<typeof Example>>[0]` pattern no longer works once the
  render callback takes no props; exported props types should be explicit at the
  component boundary or derived from a shared source of truth.

### 4. Re-test Frame and clientEntry behavior

Frame and navigation APIs still live in the UI runtime, but imports and types
change. Re-test every path that uses:

- `<Frame>`
- `clientEntry`
- `run({ loadModule, resolveFrame })`
- `handle.frame`
- `handle.frames.get(...)`
- `link(...)`
- `navigate(...)`
- `addEventListeners(...)`
- `on(...)`

The current high-risk files are the document shell, `app/entry.js`,
`FrameSubmitEnhancement`, catalog/advice/portfolio/guidelines frame flows, and
the static middleware allowlist.

### 5. Check non-UI changelog items

- Search for `remix/multipart-parser` and `MultipartPart.headers`. If introduced
  later, use object header access under beta.
- If using the Remix test CLI, replace `remix-test` with the beta test exports.
- Consider whether new beta exports (`remix/assert`, `remix/test`,
  `remix/node-fetch-server/test`) can replace local test helpers in a separate
  follow-up.
- Keep `remix/data-table` alpha.4 migration notes in mind only if the app starts
  using data-table APIs; this repo does not currently import them.

## Separate-chat implementation prompts

Run these prompts one by one in separate chats. Each prompt should produce a
small PR or a clearly scoped follow-up plan before moving to the next checkbox.

- [ ] **Prompt 1 — Upgrade package metadata only**

  ```text
  We are starting the Remix beta migration. Read AGENTS.md, docs/REMIX_V3_PACKAGES.md, docs/UI_ARCHITECTURE_GUIDELINES.md, docs/BIOME_RULES.md, and docs/REMIX_BETA_MIGRATION_PLAN.md first.

  Goal: upgrade package metadata from remix@3.0.0-alpha.4 to the current Remix beta and refresh the lockfile only.

  Scope:
  - Update package.json and package-lock.json for the Remix beta.
  - Do not change app source code yet except if the package manager requires lockfile metadata normalization.
  - Confirm the installed beta version and summarize the exact changelog range from alpha.4 to that version.

  Verification:
  - Run npm run typecheck and npm run test if the environment supports it.
  - If checks fail because app imports still point at removed beta exports, report the first failures without fixing them in this prompt.
  - If the environment lacks Node/npm, stop after documenting the blocker and do not fake verification.

  Deliverable: a small commit/PR that only updates package metadata and records the first compiler/runtime blockers for the next prompt.
  ```

- [ ] **Prompt 2 — Rename Remix UI runtime imports**

  ```text
  Continue the Remix beta migration after package metadata has been upgraded. Read docs/REMIX_BETA_MIGRATION_PLAN.md and inspect current compiler errors before editing.

  Goal: mechanically rename the removed alpha UI runtime import paths to beta import paths.

  Scope:
  - Replace remix/component with remix/ui.
  - Replace remix/component/server with remix/ui/server.
  - Replace remix/component/jsx-runtime with remix/ui/jsx-runtime.
  - Replace remix/component/jsx-dev-runtime with remix/ui/jsx-dev-runtime if present.
  - Update tsconfig.json jsxImportSource.
  - Update static/runtime allowlists that reference @remix-run/component so beta UI runtime assets can load.
  - Update source comments that describe these imports as current API.

  Constraints:
  - Keep component signatures unchanged unless the compiler cannot progress without a minimal compatibility edit.
  - Do not start the handle.props migration in this prompt.

  Verification:
  - Run npm run typecheck and npm run test.
  - Record remaining errors, grouped by import/export issue vs component signature issue.

  Deliverable: a focused commit/PR for import/runtime path migration plus a short list of errors that Prompt 3 should address.
  ```

- [ ] **Prompt 3 — Decide and document beta props typing convention**

  ```text
  Before converting components to Remix beta handle.props, decide the props typing convention for this repo. Read AGENTS.md TypeScript style, docs/REMIX_BETA_MIGRATION_PLAN.md, and examples of current component prop types.

  Goal: make a small documentation/code-guidance change that defines how component props are typed under the beta UI runtime.

  Scope:
  - Decide whether beta components should use explicit exported props types at UI boundaries by default.
  - Update AGENTS.md and/or docs/UI_ARCHITECTURE_GUIDELINES.md with the chosen rule.
  - If a tiny example change is useful, limit it to one low-risk shared component.

  Constraints:
  - Do not mass-convert app components in this prompt.
  - Keep the rule compatible with the existing "one props shape per UI boundary" guidance.

  Verification:
  - Run npm run check if any code changed.
  - For docs-only changes, run git diff --check.

  Deliverable: a small commit/PR establishing the beta props typing rule that later conversion prompts must follow.
  ```

- [ ] **Prompt 4 — Convert shared layout and form components to `handle.props`**

  ```text
  Continue the Remix beta migration. The import paths should already point at remix/ui, and the beta props typing convention should be documented.

  Goal: convert shared components under app/components/ from the alpha `(handle, setup) => (props) => JSX` shape to the beta `Handle<Props>` + `handle.props` shape.

  Scope:
  - Start with shared form components and layout/navigation/data-display components in app/components/.
  - Remove unused `_setup?: unknown` parameters.
  - Move render callback prop reads to `handle.props`.
  - Export/import props types where they cross module boundaries.
  - Keep unrelated styling and behavior unchanged.

  Verification:
  - Run npm run typecheck after this directory.
  - Run focused tests that cover pages using shared components, then npm run test if feasible.

  Deliverable: a focused commit/PR for app/components/ conversion only, with remaining component directories listed for Prompt 5.
  ```

- [ ] **Prompt 5 — Convert feature page components to `handle.props`**

  ```text
  Continue the Remix beta migration after shared components have been converted.

  Goal: convert feature-level TSX components from callback props to beta `handle.props`, one feature directory at a time.

  Scope:
  - Convert app/features/portfolio first, run focused checks, then continue.
  - Convert app/features/guidelines, app/features/catalog, and app/features/advice in separate logical commits if the diff grows.
  - Update controllers/tests that build props for jsx(Component, props) to use the single exported props type for each component boundary.
  - Preserve existing Frame, form, and progressive enhancement behavior.

  Constraints:
  - Do not refactor business logic while converting signatures.
  - If one feature reveals a broader runtime issue, stop and document it before converting more features.

  Verification:
  - Run npm run typecheck after each feature directory.
  - Run npm run test after the full feature conversion.

  Deliverable: one or more small commits/PRs converting feature components, with any runtime risks called out for Prompt 6.
  ```

- [ ] **Prompt 6 — Re-test and fix Frame/clientEntry runtime flows**

  ```text
  Continue the Remix beta migration after imports and component signatures compile.

  Goal: verify and fix beta runtime behavior around Frame, clientEntry, navigation, and server rendering.

  Scope:
  - Inspect app/entry.js, DocumentShell, render(), FrameSubmitEnhancement, and all uses of Frame/clientEntry.
  - Re-test catalog import/filter/list/detail analysis flows.
  - Re-test portfolio add/update flows.
  - Re-test guidelines add/update/delete flows.
  - Re-test advice analysis Frame flows.
  - Confirm static middleware serves the beta UI runtime assets needed by hydration.
  - Fix only issues directly tied to the beta UI runtime migration.

  Verification:
  - Run npm run typecheck, npm run test, and npm run check.
  - If practical, start the app and manually exercise the listed flows.

  Deliverable: a focused commit/PR for runtime fixes plus a concise list of any behavior that still needs manual browser verification.
  ```

- [ ] **Prompt 7 — Audit non-UI beta changelog items**

  ```text
  Finish the Remix beta migration audit. Read the upstream changelog from alpha.4 through the installed beta version and compare it to the app.

  Goal: handle beta changelog items outside the UI runtime migration.

  Scope:
  - Search for remix/multipart-parser and MultipartPart.headers usage; update to object header access if present.
  - Search for remix-test usage; replace with beta test exports if present.
  - Evaluate whether remix/assert, remix/test, remix/node-fetch-server/test, remix/auth, remix/auth-middleware, remix/cop-middleware, or remix/csrf-middleware should replace any local helpers now.
  - Confirm data-table breaking changes do not affect this app unless data-table imports have been added.
  - Confirm Node.js version assumptions are documented for local development and CI.

  Constraints:
  - Prefer audit notes over speculative refactors.
  - Only replace local helpers when the beta package clearly matches existing behavior and tests can cover it.

  Verification:
  - Run npm run check.
  - Run npm run test.

  Deliverable: a final audit commit/PR, or a docs-only note if no code changes are needed.
  ```

- [ ] **Prompt 8 — Final migration cleanup**

  ```text
  After all Remix beta migration code prompts are merged, do a final cleanup pass.

  Goal: remove stale alpha-era documentation and confirm the repository now describes beta as the current baseline.

  Scope:
  - Update docs/REMIX_BETA_MIGRATION_PLAN.md checklist statuses.
  - Update docs/REMIX_V3_PACKAGES.md "Version in use" and current usage tables.
  - Remove or reword notes that say the app still imports remix/component.
  - Update docs/UI_ARCHITECTURE_GUIDELINES.md and docs/FRAME_COMPONENT_MIGRATION_PLAN.md to use remix/ui as the unqualified current API.
  - Keep historical changelog notes if they still help explain the migration.

  Verification:
  - Run git diff --check.
  - Run npm run check if any code or checked config changed.

  Deliverable: a cleanup commit/PR that makes the docs match the completed beta migration.
  ```

## Open questions before coding the upgrade

- Should we adopt beta-only first-party UI components (`remix/ui/button`,
  `remix/ui/menu`, etc.) now, or keep the upgrade limited to preserving existing
  UI behavior?
- Should component props types become explicit exported types during the
  `handle.props` migration, or should we establish a new derivation helper first?
- Does CI already run on Node.js `24.3.0` or later, or do we need an environment
  setup change before the package upgrade?
