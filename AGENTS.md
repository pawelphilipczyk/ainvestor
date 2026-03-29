# Agent Working Agreement

This repository uses a server-first UI architecture. Before making UI-related changes, read:

- `docs/UI_ARCHITECTURE_GUIDELINES.md`

Before making Remix framework changes, read:

- `docs/REMIX_V3_PACKAGES.md`

Before writing any JS/TS/CSS code, read:

- `docs/BIOME_RULES.md`

## UI translations (i18n)

User-visible copy lives in **`app/locales/en.ts`** as a flat `en` object keyed by dot-separated paths (for example `nav.portfolio`, `portfolio.title`). This keeps all English strings in one module for now; when the map grows unwieldy, split into feature files and merge into `en` (or add `app/locales/pl.ts`, etc.) without changing call sites.

**Server rendering:** Import **`t`** from `app/lib/i18n.ts` for static strings. Use **`format(template, { name, count })`** from the same module when a string needs `{placeholder}` substitution. Page titles and flash/API error messages should use `t()` / `format()` at the controller or handler boundary so they stay translatable.

**Remix v3:** The framework does not ship a dedicated i18n package. Server-first apps typically resolve a locale in middleware or the session, load the right message map, and pass strings into JSX (or a small `t` scoped to the request). Community stacks often pair **i18next** with **remix-i18next** when they need React-heavy client translation; this project’s UI is mostly server-rendered JSX, so a typed message map plus `t`/`format` is enough until multi-locale routing or client-only copy demands a heavier library.

**ETF type labels** shown in the catalog and guidelines come from **`ETF_TYPE_LABELS`** in `app/locales/en.ts` (typed as `Record<EtfType, string>` for exhaustiveness) via `formatEtfTypeLabel()` in `app/lib/guidelines.ts`, which falls back to **`catalog.etfTypeUnknown`** if a label is missing. Keep data keys like `real_estate` stable; translate display labels only.

**Section intros** (`SECTION_INTROS` in `app/lib/section-intros.ts`) are built from locale keys so home cards and page headers stay aligned with `t()`.

**Sidebar nav:** Use **`getNavLinks()`** from `app/components/sidebar-nav.ts` (not a module-level array) so link labels are resolved when the shell or intro page renders, not at import time.

**Client islands:** A tiny JSON blob in **`DocumentShell`** (`#ui-client-messages`) exposes strings that browser-only code must show (for example the fetch-submit fallback error). Prefer keeping user-visible text on the server; add fields there only when an island has no other way to obtain copy.

## Required defaults for UI work

1. Follow semantic HTML first.
2. Use native browser primitives before custom JavaScript.
3. Use Tailwind utility classes as the default styling approach.
4. Keep JavaScript modular, minimal, and enhancement-only.
5. Do not introduce React/Vue-style component frameworks unless explicitly requested.

## Required defaults for Remix work

1. **Remix documentation source:** Always use the GitHub repository as the only source of truth for Remix v3 APIs and patterns: [https://github.com/remix-run/remix](https://github.com/remix-run/remix). Do not rely on older docs or other websites.

2. **Maximize Remix package usage:** Before writing a helper, utility, or middleware from scratch, check whether `remix` already provides it. Prefer Remix packages over custom implementations. Common examples:
   - Use `remix/cookie` instead of custom HMAC signing
   - Use `remix/session-middleware` instead of manual session read/save in each handler
   - Use `remix/data-schema` instead of ad-hoc form validation
   - Use `remix/static-middleware` instead of custom static file routing
   - Use `remix/method-override-middleware` instead of manually reading `_method` fields
   - Use `remix/response/html`, `remix/response/redirect`, `remix/response/file` instead of `new Response(...)` wrappers
   - Use `form()` and `resources()` shorthand in `routes.ts` instead of manual `get()`/`post()` pairs
   - Use `route.href()` instead of hardcoded URL strings in HTML templates

3. **If you find code that a Remix package could replace**, refactor it — do not leave duplicated functionality alongside an available package.

## Scope rules

- When a task involves UI implementation, patterns in `docs/UI_ARCHITECTURE_GUIDELINES.md` are the source of truth.
- When a task involves Remix routing, sessions, middleware, or HTTP utilities, `docs/REMIX_V3_PACKAGES.md` is the reference.
- For all JS/TS/CSS formatting and lint rules, `docs/BIOME_RULES.md` is the reference. Run `npm run check` before committing.
- ClientEntry components that are feature-specific live next to the feature (`.component.js` suffix). Shared clientEntry components live in `app/components/`.

## Function signature rule

- **Functions with more than 2 arguments:** Prefer a single object parameter instead of multiple positional parameters. Example: `render({ title, session, currentPage, body, init })` instead of `render(title, session, currentPage, body, init)`.

## TypeScript style

- **Naming — spell it out:** Prefer full words in function and variable names; avoid abbreviations (`ctx`, `req`, `res`, `idx`, `opts`, single-letter loop names, and similar). Exceptions: domain terms that are already standard words (`id`, `url`, `tab`), the project’s **`t()`** / **`format()`** helpers for i18n, and names you cannot change because they implement or shadow an external API (for example a parameter named `request` when matching a framework signature).

- **Keep types simple:** Prefer small object literals, `as const` for fixed maps/unions, and `keyof typeof` over hand-maintained string union types when a single source of truth exists.
- **Prefer inference:** Omit redundant annotations on locals and private helpers. For component props, **inline the props object** on the inner implementation. If another module needs the props type, derive it once: **`type FooProps = Parameters<ReturnType<typeof Foo>>[0]`** (do not hand-duplicate a parallel `type FooProps = { ... }`).
- **When to annotate explicitly:** Public boundaries, `remix` discriminated props (e.g. inputs where `type` narrows other attributes), or places where inference produces `any` or overly wide types.

- **Form controls:** Prefer **MDN / HTML attribute names** on props (`name`, `type`, `autocomplete`, `class`, …). Do not rename to `fieldName` or similar. Listing a small `type` shape for each wrapper is OK; avoid `...rest as Props<'input'>` — `Props<'input'>` from `remix/component` is a discriminated union, and spreading `rest` breaks narrowing (e.g. `role`, `list` on `<input>`).
