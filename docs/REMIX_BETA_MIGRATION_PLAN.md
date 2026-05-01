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

## Suggested prompt sequence for implementation

1. "Upgrade the Remix package to beta and update the lockfile only. Do not change
   app code yet. Report the first typecheck failures."
2. "Rename Remix component imports to the beta UI runtime, including tsconfig and
   static middleware allowlists. Keep component signatures unchanged unless the
   compiler requires it."
3. "Decide the beta-era props typing convention, then convert server-rendered
   components from callback props to `handle.props`, one feature directory at a
   time, with focused tests after each directory."
4. "Re-test Frame/clientEntry flows and fix runtime issues around `Frame`,
   `run`, `resolveFrame`, `navigate`, and `link`."
5. "Audit beta-only changelog items: multipart headers, Remix test exports, Node
   version assumptions, and newly available package helpers."

## Open questions before coding the upgrade

- Should we adopt beta-only first-party UI components (`remix/ui/button`,
  `remix/ui/menu`, etc.) now, or keep the upgrade limited to preserving existing
  UI behavior?
- Should component props types become explicit exported types during the
  `handle.props` migration, or should we establish a new derivation helper first?
- Does CI already run on Node.js `24.3.0` or later, or do we need an environment
  setup change before the package upgrade?
