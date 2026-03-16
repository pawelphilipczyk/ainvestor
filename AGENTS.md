# Agent Working Agreement

This repository uses a server-first UI architecture. Before making UI-related changes, read:

- `docs/UI_ARCHITECTURE_GUIDELINES.md`

Before making Remix framework changes, read:

- `docs/REMIX_V3_PACKAGES.md`

Before writing any JS/TS/CSS code, read:

- `docs/BIOME_RULES.md`

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
- Islands that are feature-specific live next to the feature HTML (`.island.js` suffix). Shared islands live in `app/islands/`.
