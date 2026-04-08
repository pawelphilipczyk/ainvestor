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

- [x] **Catalog import** — Bank JSON import form uses **`data-frame-submit="catalog-list"`** + **`data-error-id`** + **`data-reset-form`**; `POST /catalog/import` returns **JSON** when **`Accept` includes `application/json`** (matches `FrameSubmitEnhancement`) so fetch does not follow redirect and consume flash — **`200`** with **`bannerText` / `bannerTone`** on success, **`422`** with **`error`** on failure. Full POST without that header keeps **redirect + flash** (progressive enhancement).
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

- [x] **Catalog filter (and any similar GET forms)** — Catalog filter uses **`data-frame-submit="catalog-list"`** + **`data-frame-get-fragment-action`** on **`FrameSubmitEnhancement`**: GET submit sets the named frame’s **`src`**, **`reload()`**, then **`history.replaceState`** for the document URL so the list updates without a full document navigation (more reliable than **`navigate(..., { target })`**, which can fall back to the **top** frame or skip interception in some environments). Import POST uses **`data-frame-submit`** (spinner + list frame reload; JSON success body carries **`bannerText`** for inline feedback). **`FetchSubmitEnhancement` removed**. Clear-filters link uses **`data-navigation-loading`** (link enhancement) for spinner UX.

### Phase 7 — Legacy `FetchSubmitEnhancement` (`fetch-submit`) removal

- [x] **Delete `fetch-submit.component.js`** — Removed `FetchSubmitEnhancement` from `document-shell.tsx` and deleted the module; no templates used `data-fetch-submit`, `data-fragment-*`, or `data-replace-main`.
- [x] **Docs** — Updated `docs/UI_ARCHITECTURE_GUIDELINES.md` to describe **`<Frame>`** + **`FrameSubmitEnhancement`** as the default for partial HTML and linked `docs/FRAME_COMPONENT_MIGRATION_PLAN.md`.

### Phase 8 — Frame-aware navigation (`link` + `navigate`)

- [x] **Audit navigations** — Findings below (2026-04-08). Implementation of `link` / `navigate` outside existing Frame flows is **optional** and can be scoped in a follow-up PR if desired.

#### Phase 8 — Audit findings

**Scope checked:** `app/` for `window.location`, `location.assign`, full reloads, `rmx-document` anchors, GET forms, and every `clientEntry`.

| Area | What we do today | Frame / `navigate` fit |
|------|------------------|-------------------------|
| **Sidebar primary nav** | `<a href={…} rmx-document>` per item in `sidebar.tsx` — full document navigation, no `data-navigation-loading`. | **Keep full nav.** Section changes replace the whole page; no named frame owns “the rest of the shell” in a way that would benefit from a partial reload only. |
| **Login (`Link` + loading)** | `navigationLoading` → `NavigationLinkLoadingEnhancement` → `preventDefault` + busy state + `window.location.assign(href)` (`navigation-link-loading.component.js`). | **Optional follow-up:** try Remix **`navigate(href)`** (or `link` mixin on the anchor) if it preserves the same UX without a hard assign. Note `entry.js` stubs `window.navigation` on Firefox/Safari — verify behavior before swapping. |
| **Catalog filter** | GET form with `data-frame-submit` + `data-frame-get-fragment-action`; `FrameSubmitEnhancement` sets frame `src`, `reload()`, `history.replaceState` (primary) with **`navigate` / `location.assign` fallbacks** (`frame-submit.component.js`). | **Already aligned** with frame-first navigation; fallbacks are intentional. |
| **Catalog “clear filters” / in-page links** | `Link` / `data-navigation-loading` where a spinner is wanted (`catalog-page.tsx`). | Same as login link: **optional** `navigate` instead of `assign` if validated cross-browser. |
| **Catalog ETF back** | `CatalogEtfBackEnhancement`: `history.back()` when possible, else `location.assign(href)`. | **Keep.** Back semantics are not a named-frame refresh. |
| **Other `rmx-document` links** | Home cards (`section-intro-card.tsx`), branding (`app-branding.tsx`), tab rows (`tabs-nav.tsx`), portfolio/guidelines/catalog ETF inline links. | **Keep full nav** unless a specific screen is redesigned around a persistent frame boundary. |
| **`PortfolioTradeFocus`** | Scroll + form field focus only; no navigation. | **N/A** |
| **`SidebarInteractions`** | Mobile overlay open/close. | **N/A** |
| **`ThemeToggleInteractions`** | `classList` + `localStorage`. | **N/A** (per edge-case table) |
| **`TabsNavScrollRestoration`** | `sessionStorage` scroll restore on tab navigations. | **N/A** (per edge-case table) |
| **`GuidelinesDeleteDialogInteractions`** | Document-level click delegation for edit/delete dialogs. | **Optional hygiene** (from edge-case table): scope listeners to the guidelines tree / frame root — not required for `navigate`, but reduces global listeners. |

**`navigate` usage already in app:** `frame-submit.component.js` imports and uses **`navigate()`** for advice result reload and GET-fragment flows (with documented fallbacks when `target` / Navigation API behavior is unreliable).

#### Phase 8 — Follow-up todos (separate PRs)

- [ ] **Guidelines: scope `GuidelinesDeleteDialogInteractions` off `document`** — `GuidelinesDeleteDialogInteractions` (`guidelines-list.component.js`) registers a **`click` listener on `document`** and uses `target.closest(...)` for `[data-guideline-edit]`, `[data-guideline-cancel-edit]`, and `[data-dialog-id]`. That means every click on the page runs the handler (cheap guards, but global). **Goal:** attach the same listener to a **narrower root** that always wraps guidelines UI when the client entry is mounted—for example the guidelines list container or the guidelines `<Frame>` subtree—so clicks outside guidelines never enter this code path. Keep the same `<dialog>` HTML and `openDialogForTrigger` behavior; this is **listener hygiene**, not a Frame navigation change.

- [ ] **`NavigationLinkLoadingEnhancement`: prefer Remix `navigate()` when the Navigation API is available** — Today (`navigation-link-loading.component.js`) the enhancement **`preventDefault`s** the click, sets busy state, and calls **`window.location.assign(anchor.href)`**. Remix **`navigate(href)`** (`remix/component`) drives **`window.navigation.navigate`** with Remix frame state and is what the runtime expects for intercepted navigations. **Goal:** where product still wants the loading overlay, call **`navigate(href)`** when **`globalThis.navigation`** is the real Navigation API (not the inert stub in `app/entry.js` for older Firefox/Safari), and **fall back** to **`location.assign`** (or native navigation) when it is not—then verify **Chromium, current Firefox, current Safari** (MDN: [Window.navigation](https://developer.mozilla.org/en-US/docs/Web/API/Window/navigation), [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API)). Same question applies to any other **`assign`-only** paths that should participate in Remix navigation when possible.

- [ ] **`link` mixin vs `rmx-document`: optional consistency pass on in-app anchors** — These behave differently in Remix’s listener (`@remix-run/component` `navigation.ts`): anchors with **`rmx-document`** **opt out** of reading `rmx-target` / `rmx-src` from the link (full **document** navigation). **`mix={[link(href, options)]}`** on `<a>` sets **`href`** plus **`rmx-target` / `rmx-src` / `rmx-reset-scroll`**, so a click can be **intercepted** and routed through the **top or named `<Frame>`** reload path. **Goal:** do **not** blanket-replace sidebar or other links that intentionally mean “replace the whole document.” Optionally **audit** a small set of routes where intercepted navigation is desired but markup only uses plain **`rmx-document`** today; adopt **`link(...)`** only there. Record the rule (“full page → `rmx-document`; frame-aware same-document → `link` + options”) in this file or **`docs/UI_ARCHITECTURE_GUIDELINES.md`** when the first example lands.

---

## Shared infrastructure added in Phase 2

| Component | Purpose |
|-----------|---------|
| `render()` `resolveFrame` option | Forwards a `resolveFrame` callback to `renderToStream` so `<Frame>` components resolve during SSR |
| `FrameSubmitEnhancement` (`app/components/frame-submit.component.js`) | Shared `clientEntry` mounted in `DocumentShell`; intercepts forms with `data-frame-submit="<name>"`. **POST:** fetch + reload or **`data-frame-replace-from-response`** (`frameHandle.replace()` for 200 and **422** when the response is HTML). Supports `data-frame-reload-src`, optional **`data-frame-hide-form-on-success`** with replace-from-response, `data-error-id` for **non-HTML** 422 JSON fallbacks, **`200` JSON** with **`bannerText`** / **`bannerTone`** (inline success/info feedback when **`data-error-id`** is set — catalog import), and `data-reset-form`. **GET:** when **`data-frame-get-fragment-action`** is set, **`handle.frames.get(name)`** → set **`src`**, **`reload()`**, **`history.replaceState`** (fallback **`navigate`** / **`location.assign`**). |
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
