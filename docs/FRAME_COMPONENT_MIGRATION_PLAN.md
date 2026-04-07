# Frame component migration plan

This document tracks moving from **`data-fetch-submit`** + manual DOM updates (`innerHTML`, `data-replace-main`, fragment fetches) toward **Remix `<Frame>`** partial HTML and **`handle.frame.reload()`**, using the **`resolveFrame`** hook already wired in `app/entry.js`.

Work proceeds in **multiple small pull requests**. When a task ships, change its checkbox from `[ ]` to `[x]` in this file (same PR as the code, or a tiny follow-up).

## Principles

- Prefer **`<Frame>`** for any region that should refresh **without** a full document navigation while staying **server-authored HTML**.
- Prefer **normal `<form method="post">`** + full navigation when a full page refresh is acceptable and no partial region needs updating.
- **Retire JSON responses** used only to drive client DOM patches for HTML-shaped UI; return **HTML fragments** suited to Frame boundaries instead (including errors where today we return `422` + JSON).
- Keep **feature-scoped `clientEntry`** only for behavior that is not “replace this server-rendered subtree” (loading chrome, theme, scroll restore, etc.).
- For **in-document navigation** that should drive **`<Frame>` reloads** (including named frames), Remix’s component runtime exposes **`link`** (a mixin for `<a>` / `<area>`) and **`navigate()`** (imperative), both built on the **Navigation API** with frame-aware state. They replace ad hoc `location` / full reloads where a frame partial would suffice—but only if the destination behavior matches (correct `src` / partial HTML). See **`remix/component`** exports and `docs/REMIX_V3_PACKAGES.md`.

---

## Todo list

### Phase 1 — Redirect-only POSTs (no partial UI)

- [x] **Catalog import** — Remove `data-fetch-submit` from the bank JSON import form on `CatalogPage` (`app/features/catalog/catalog-page.tsx`). Rely on normal POST + redirect from `routes.catalog.import`. Update `app/features/catalog/catalog.test.ts` expectations. **Follow-up:** Phase 2 frames the ETF list below; until then a full redirect reloads the whole catalog page (including a future frame's initial `src` fetch).
- [x] **Sidebar sign-out** — Remove `data-fetch-submit` from the logout form in `app/components/sidebar.tsx`. Rely on normal POST + redirect.

### Phase 2 — List regions currently using fragment `innerHTML`

- [x] **Portfolio: frame around the holdings list** — `<Frame name="portfolio-list" src={routes.portfolio.fragmentList.href()}>` replaces `<div id="portfolio-list">`. Forms use `data-frame-submit="portfolio-list"` which triggers `handle.frames.get('portfolio-list')?.reload()` via shared `FrameSubmitEnhancement` clientEntry. Server renders Frame content via `resolveFrame` during SSR. Fragment handler uses `renderToStream`.
- [x] **Guidelines: frame around the guidelines list** — Same pattern: `<Frame name="guidelines-list">` with `data-frame-submit="guidelines-list"` on add/update/delete forms. `resolveFrame` in SSR, streamed fragment handler.
- [x] **Catalog: frame around ETF list** — New `CatalogListFragment` component and `GET /catalog/fragments/list` route. Filter query params (`type`, `q`) forwarded via Frame `src`. Import still uses full redirect; Frame re-renders on navigation. `resolveFrame` for SSR.

### Phase 3 — Full main-region swap (`data-replace-main`)

- [x] **Advice analysis forms** — Replace `data-fetch-submit` + `data-replace-main` on `AdvicePage` with a **`<Frame>`** for the analysis result area. `GET /advice/fragments/advice-result?tab=` returns the result card HTML; forms use `data-frame-submit="advice-result"` plus `data-frame-reload-src` so `FrameSubmitEnhancement` refreshes the named frame via Remix `navigate()` (correct fragment `src` for the Navigation API). Gist snapshots use **separate files** per mode (`advice-buy-next.json` / `advice-portfolio-review.json`), with legacy `advice-analysis.json` still read when present. `render()` passes `resolveFrame` for SSR. No remaining `data-replace-main` in app features. **Global shell CSS** (`document-shell.tsx`, `document-styles.ts`) intentionally matches **`main`** — do not add extra `body`/`#page-content` overflow rules when debugging advice Frame layout.

### Phase 4 — Catalog ETF deep-dive (today: JSON + text node)

- [x] **Server: HTML instead of JSON** — The catalog ETF analysis POST handler returns **HTML** via `CatalogEtfAnalysisFragment` (prose + error callout), with appropriate status codes. `GET /catalog/fragments/etf-analysis/:id` returns an empty fragment for SSR / initial frame load.
- [x] **UI: `<Frame>` for the result** — `CatalogEtfPage` uses `<Frame name="catalog-etf-analysis">` and **`FrameSubmitEnhancement`** with `data-frame-submit` + **`data-frame-replace-from-response`** so the POST response HTML is applied with **`frameHandle.replace()`** (avoids storing large analysis text in the session cookie). The bespoke `catalog-etf-analysis-form.component.js` clientEntry was removed.
- [x] **Document shell** — Removed `catalogEtfAnalysisNetworkError` from `#ui-client-messages` in `document-shell.tsx`.

### Phase 5 — JSON `422` validation + `data-error-id` (portfolio / guidelines)

Today these flows use **`Accept: application/json`** and client-side error elements. To align with Frame-first HTML:

- [x] **Portfolio add ETF** — Return **HTML** for validation failures (list fragment with top **inline error** callout) and for **successful** create/update when **`Accept` is exactly `text/html`** (matches `FrameSubmitEnhancement` fetch; ordinary browser POSTs keep redirect + flash). Add/update forms use **`data-frame-replace-from-response`** without **`data-error-id`**. JSON `422` kept for API-style `Accept: application/json` tests.
- [x] **Guidelines mutations** — Same as portfolio: **`Accept: text/html`** returns list fragment with **inline error** (422) or updated list (200); add/update/delete forms use **`data-frame-replace-from-response`**. **`Accept: application/json`** keeps **422 JSON** for tests/API-style callers.

### Phase 6 — GET forms with `data-navigation-loading`

- [x] **Catalog filter (and any similar GET forms)** — Catalog filter uses **`data-frame-submit="catalog-list"`** + **`data-frame-get-fragment-action`** on **`FrameSubmitEnhancement`**: GET submit builds the document URL and matching fragment URL, then **`navigate(documentUrl, { target, src, history: 'replace' })`** so the list frame stays aligned with the URL bar. Import POST uses a plain form (no loading intercept). **`FetchSubmitEnhancement` removed** (no remaining `data-fetch-submit` / GET form interception). Clear-filters link uses **`data-navigation-loading`** (link enhancement) for spinner UX.

### Phase 7 — Legacy `FetchSubmitEnhancement` (`fetch-submit`) removal

- [x] **Delete `fetch-submit.component.js`** — Removed `FetchSubmitEnhancement` from `document-shell.tsx` and deleted the module; no templates used `data-fetch-submit`, `data-fragment-*`, or `data-replace-main`.
- [x] **Docs** — Updated `docs/UI_ARCHITECTURE_GUIDELINES.md` to describe **`<Frame>`** + **`FrameSubmitEnhancement`** as the default for partial HTML and linked `docs/FRAME_COMPONENT_MIGRATION_PLAN.md`.

### Phase 8 — Frame-aware navigation (`link` + `navigate`)

- [ ] **Audit navigations** — Walk sidebar and in-app links, GET-driven URL changes, and any `clientEntry` that sets `window.location` or forces a full document reload. Flag flows where a **`<Frame>`** (or named frame) could refresh instead. Where that fits, prefer **`mix={[link(href, options)]}`** on anchors or **`navigate(href, options)`** in handlers (`target` / `src` / `history` / `resetScroll` per `NavigationOptions`). **GET `<form>`** submissions are not handled the same way as `link` in the runtime—those flows may need a deliberate design change (e.g. filter via frame `src` query, or submit handler calling `navigate`). Expect **some architectural changes** (route splits, partial HTML, or moving controls inside/outside a frame) when adopting this; capture decisions inline in this file or the PR.

---

## Shared infrastructure added in Phase 2

| Component | Purpose |
|-----------|---------|
| `render()` `resolveFrame` option | Forwards a `resolveFrame` callback to `renderToStream` so `<Frame>` components resolve during SSR |
| `FrameSubmitEnhancement` (`app/components/frame-submit.component.js`) | Shared `clientEntry` mounted in `DocumentShell`; intercepts forms with `data-frame-submit="<name>"`. **POST:** fetch + reload or **`data-frame-replace-from-response`** (`frameHandle.replace()` for 200 and **422** when the response is HTML). Supports `data-frame-reload-src`, optional **`data-frame-hide-form-on-success`** with replace-from-response, `data-error-id` for **non-HTML** 422 JSON fallbacks, and `data-reset-form`. **GET:** when **`data-frame-get-fragment-action`** is set, **`navigate(documentUrl, { target, src, history: 'replace' })`** so the frame `src` matches the document query string. |
| `requestAcceptsFrameSubmitHtml` / `requestAcceptsApplicationJson` (`app/lib/frame-submit-request.ts`) | Single source of truth for **`Accept`** branching in POST handlers (must stay aligned with the headers this clientEntry sends). |

---

## Edge cases that did not map cleanly — planned direction

| Current pattern | Planned change |
|-----------------|----------------|
| Catalog ETF analysis JSON → `textContent` | **HTML response + `<Frame>`** (Phase 4). |
| Guidelines / portfolio `422` JSON + `data-error-id` | **HTML fragments** (error UI rendered on server) inside the same Frame as the form or list; drop JSON for that path. |
| Advice `data-replace-main` | **Frame-bound partial routes**; server returns only the subtree for the frame (Phase 3). |
| `GuidelinesDeleteDialogInteractions` (document delegated clicks) | Prefer **`on('click', …)`** on triggers inside the guidelines tree or inside the Frame boundary so listeners are not document-wide; keep `<dialog>` HTML. |
| `NavigationLinkLoadingEnhancement` | Not a Frame concern; keep a small enhancement or move loading state to **link `mix={on(...)}`** where practical. |
| `TabsNavScrollRestoration` | Remains a focused `clientEntry`; no Frame migration. |
| Theme toggle | Unchanged; local enhancement only. |
| `data-frame-replace-from-response` + **302** to a full page | `fetch(..., redirect: 'follow')` ends with **200 `text/html`** document HTML; **`frameHandle.replace()`** would swap the frame with the whole page. Handlers that use replace-from-response must return **422/200 list fragments** for `requestAcceptsFrameSubmitHtml` on every exit path (including “stale catalog” / schema failures), not redirects. |

---

## References

- `docs/UI_ARCHITECTURE_GUIDELINES.md` — partial UI via `<Frame>` and `handle.frame.reload()`.
- `docs/REMIX_V3_PACKAGES.md` — `remix/component`, `<Frame>`, `run({ loadModule, resolveFrame })`.
- `remix/component` — **`link`**, **`navigate`**, **`NavigationOptions`** (frame-aware navigation alongside `<Frame>`; see `@remix-run/component` types in `node_modules` for the current surface).
- `app/entry.js` — `resolveFrame` implementation.
