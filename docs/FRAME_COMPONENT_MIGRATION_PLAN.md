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

- [x] **Advice analysis forms** — Replace `data-fetch-submit` + `data-replace-main` on `AdvicePage` with a **`<Frame>`** for the analysis result area. `GET /advice/fragments/result?tab=` returns the result card HTML; forms use `data-frame-submit="advice-result"` (`FrameSubmitEnhancement`). `render()` passes `resolveFrame` for SSR. No remaining `data-replace-main` in app features (handler branch in `fetch-submit.component.js` kept until Phase 7 cleanup).

### Phase 4 — Catalog ETF deep-dive (today: JSON + text node)

- [ ] **Server: HTML instead of JSON** — Change the catalog ETF analysis POST handler to return **HTML** (fragment suitable for a Frame), e.g. rendered prose + error markup, with appropriate status codes, instead of `{ text }` / `{ error }` JSON.
- [ ] **UI: `<Frame>` for the result** — Wrap the result region in `<Frame>`; after successful analysis, **reload the frame** (or navigate the frame `src`) so content stays server-owned. Remove `catalog-etf-analysis-form.component.js` JSON `fetch` + `textContent` patching; any minimal `clientEntry` should only trigger **`handle.frame.reload()`** or submit via native form if compatible with Frame navigation.
- [ ] **Document shell** — Remove `catalogEtfAnalysisNetworkError` from `#ui-client-messages` in `document-shell.tsx` if no longer needed for client-only copy.

### Phase 5 — JSON `422` validation + `data-error-id` (portfolio / guidelines)

Today these flows use **`Accept: application/json`** and client-side error elements. To align with Frame-first HTML:

- [ ] **Portfolio add ETF** — Return **HTML** for validation failures (fragment that includes the form + error callout) or reload a frame that contains the form + errors; remove dependence on JSON `422` + `data-error-id` in `fetch-submit.component.js` for this form.
- [ ] **Guidelines mutations** — Same: prefer **HTML error partials** inside a Frame or full redirect with flash; remove `prefersJson` / JSON error branches where replaced.

### Phase 6 — GET forms with `data-navigation-loading`

- [ ] **Catalog filter (and any similar GET forms)** — Either keep full navigation without intercepting submit or move filtering behind a **Frame** `src` query URL so results update inside the frame without custom `window.location.assign` deferral. Goal: delete GET interception from `fetch-submit.component.js` when nothing uses it.

### Phase 7 — Shared `FetchSubmitEnhancement` removal

- [ ] **Delete or gut `fetch-submit.component.js`** — Once no `data-fetch-submit`, `data-fragment-*`, `data-replace-main`, or `data-navigation-loading` remain, remove `FetchSubmitEnhancement` from `document-shell.tsx` and delete the module (or leave a stub only if something still needs it).
- [ ] **Docs** — Update `docs/UI_ARCHITECTURE_GUIDELINES.md` (fetch-submit section) to describe Frame as the default for partial HTML and link to this plan.

### Phase 8 — Frame-aware navigation (`link` + `navigate`)

- [ ] **Audit navigations** — Walk sidebar and in-app links, GET-driven URL changes, and any `clientEntry` that sets `window.location` or forces a full document reload. Flag flows where a **`<Frame>`** (or named frame) could refresh instead. Where that fits, prefer **`mix={[link(href, options)]}`** on anchors or **`navigate(href, options)`** in handlers (`target` / `src` / `history` / `resetScroll` per `NavigationOptions`). **GET `<form>`** submissions are not handled the same way as `link` in the runtime—those flows may need a deliberate design change (e.g. filter via frame `src` query, or submit handler calling `navigate`). Expect **some architectural changes** (route splits, partial HTML, or moving controls inside/outside a frame) when adopting this; capture decisions inline in this file or the PR.

---

## Shared infrastructure added in Phase 2

| Component | Purpose |
|-----------|---------|
| `render()` `resolveFrame` option | Forwards a `resolveFrame` callback to `renderToStream` so `<Frame>` components resolve during SSR |
| `FrameSubmitEnhancement` (`app/components/frame-submit.component.js`) | Shared `clientEntry` mounted in `DocumentShell`; intercepts forms with `data-frame-submit="<name>"`, POSTs via fetch, reloads the named Frame on success. Supports `data-error-id` for 422 JSON errors and `data-reset-form`. |

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

---

## References

- `docs/UI_ARCHITECTURE_GUIDELINES.md` — partial UI via `<Frame>` and `handle.frame.reload()`.
- `docs/REMIX_V3_PACKAGES.md` — `remix/component`, `<Frame>`, `run({ loadModule, resolveFrame })`.
- `remix/component` — **`link`**, **`navigate`**, **`NavigationOptions`** (frame-aware navigation alongside `<Frame>`; see `@remix-run/component` types in `node_modules` for the current surface).
- `app/entry.js` — `resolveFrame` implementation.
