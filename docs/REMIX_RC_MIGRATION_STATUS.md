# Remix RC migration — working status

**Read this first when picking the migration back up.** It holds only *where we
are* and *what is next*. Every finding, measurement and decision rationale
lives in `docs/REMIX_RC_MIGRATION_PLAN.md`; this file points at it rather than
repeating it, so the two cannot drift.

Update this file in the same commit as the work it describes. A commit cannot
contain its own hash, so leave the newest row's hash as `(pending)` and fill it
in with the next commit — an amend or rebase silently invalidates one written
ahead of time.

---

## Where we are

- **Stage:** 6 (behavior via primitives). Stages 1–5, and the Stage 6 work
  through `de7df75` (the shared `watchFrameFormSubmissions` extraction, PR
  #191), are merged on `main`.
- **Branch:** `claude/next-migration-step-18cia2`, opened fresh off `main`
  after PR #191 merged.
- **Green:** `npm run check`, `npm run typecheck`, `npm test` (583) and
  `npm run test:browser` (26) all pass.
- **Working style:** small steps. One component or one flow per commit, each
  landing green, each with its own browser coverage where the change is
  client-side.

## Done on this branch, most recent first

| Commit | What |
|---|---|
| `3c5c299` | Catalog ETF analysis form ported to native `data-rmx-target`, route-consolidation-first per the prior *Next step*. `routes.ts`'s `catalog.etf` (`GET`) and `catalog.etfAnalysis` (`POST /etf/:id/analysis`) became `...form('etf/:catalogEntryId')` nested under `catalog` — one `index`/`action` pair at `/catalog/etf/:catalogEntryId`, mapped with a separate `router.map(routes.catalog.etf, catalogEtfController)` call since `router.map()` refuses a nested route group inside the outer controller's `actions` (error message says so explicitly: call `router.map()` for that route map separately). No hidden intent field needed — the `action` route serves exactly one POST purpose. Added `CatalogEtfAnalysisFrame`, following `guidelines-list-frame.component.js`'s one-entry-per-page shape. Hit one new wrinkle beyond the guidelines/portfolio ports: `@remix-run/ui`'s `defaultResolveFrame` (`runtime/run.ts`) throws for **any** response status ≥ 500 regardless of content type — unlike 4xx, which it accepts whenever the body is HTML — so the frame's own `render()` never runs and the error fragment is silently dropped; `reloadComplete` still fires (in a `finally`), so without this fix the client code would have read "no `role=\"alert\"` present" as success and hidden the form over a request that never rendered anything. Confirmed live with a mocked OpenAI failure before touching the fix (browser test failed exactly as predicted: `[role="alert"]` never appeared). Fixed by returning `200` instead of `503` for the upstream-failure branch — the only status this route ever needs at genuine 5xx (403/404 stay as they are, both already <500 and unaffected). Added `data-frame-hide-form-on-success` support to `watchFrameFormSubmissions` (checked as a per-form attribute, same as `data-reset-form`, gated on `!failed` so a failed analysis leaves the form visible for retry) — the wrinkle flagged in the prior *Next step*, and the first thing to need it. `npm test` 583/583, `npm run test:browser` 26/26 (2 new: success hides the form and lands the analysis text with no URL drift, upstream failure renders the inline error and leaves the form/busy-state alone). |
| `de7df75` | Extracted `watchFrameFormSubmissions` (`app/components/client/frame-form-ux.component.js`) from the near-identical logic duplicated between `PortfolioTradeFormFrame` and `GuidelinesListFrame` — flagged by code review on PR #191. Checked rc.2 first for a built-in replacement before extracting: `FrameHandle` (`@remix-run/ui`'s `component.ts`) exposes only `src`, `reload()`, `replace()` and the two payload-less `reloadStart`/`reloadComplete` events, and the `button()` mixin (`@remix-run/ui/button`) is presentational only (CSS + default `type="button"`) — no busy/pending state, no submission-status API, in either. Reason 1: nothing to adopt. Both call sites' matching turned out identical once compared side by side — both target forms already carry `data-rmx-target="<frame>"`, so the shared helper matches on that attribute generically instead of `PortfolioTradeFormFrame`'s old fixed-id lookup, and it captures the submitting form/control at `submit` time (as `GuidelinesListFrame` already did) rather than re-querying by id at `reloadComplete` (as `PortfolioTradeFormFrame` used to) — needed for guidelines' multiple per-row forms, and harmless for portfolio's single form. `closeDialogsOnReload` is an option, on for guidelines only. Both `frame-submit.browser.ts` (portfolio) and `guidelines.browser.ts` pass unchanged. |
| `d6168c2` | Guidelines' 4 forms (add-instrument, add-bucket, update-target, delete) ported to native `data-rmx-target`. First attempt hit a real blocker: `data-rmx-target` commits the form's `action` as the document URL regardless of which frame it targets, and guidelines' four actions were nested paths distinct from `/guidelines` — confirmed live (`GET /guidelines/instrument` → 405 after an add). Resolved it rather than reverting under reason 3: consolidated `routes.ts`'s `guidelines` entry onto `...form('guidelines')` (one `index`/`action` GET+POST pair at `/guidelines`, the same first-party shape `advice` already used) and added a hidden `guidelineIntent` field (`addInstrument`/`addAssetClass`/`updateTarget`/`delete`) the single `action` handler switches on — same pattern as `advice`'s `adviceIntent`; `updateTarget`/`delete` take the row `id` as a hidden field instead of a path segment, and the `_method=DELETE` override is gone (no longer needed with one POST route). With every form's action now equal to the page, the `data-rmx-target` port (a `GuidelinesListFrame` client entry mirroring `PortfolioTradeFormFrame`, covering all 4 forms since it hooks the frame rather than one fixed form id) worked with no URL drift. Wrote the pattern up as the project standard in `docs/UI_ARCHITECTURE_GUIDELINES.md` §10, and closed Plan Open question 4 (chose option (b)). `npm test` 583/583, `npm run test:browser` 24/24 (5 new: add success/reset, add 422/no-reset, update-target, delete-via-dialog closes its own dialog, unrelated-reload doesn't clear the form). |
| `6265ddf` | Ported the portfolio trade form (`#portfolio-trade-form`) from `FrameSubmitEnhancement` to native `data-rmx-target="portfolio-list"`. The server side needed no change — the default frame resolver's `Accept: text/html` request already matches `requestAcceptsFrameSubmitHtml`, and it accepts 4xx HTML responses, so the existing 422 inline-error fragment (`list-fragment.tsx`'s `role="alert"` banner) renders into the frame unmodified. Added `PortfolioTradeFormFrame`, a client entry that hooks `data-reset-form` and `setSubmitButtonLoading` onto the frame's `reloadStart` / `reloadComplete` events (`handle.frames.get('portfolio-list')`) instead of our own `submit` interception; since the event carries no response data, it tells success from failure by checking for the `role="alert"` node the error fragment renders (the only one on this page) so a 422 no longer clears the form. Added the 422 characterization test first (per the prior *Next step*), confirmed it green against the old enhancement, then ported and reran it unchanged — plus a new assertion that the form field keeps its value after a 422. Browser suite now 18. Import-etf-form stays on `FrameSubmitEnhancement` (still targets the same `portfolio-list` frame via `replace()`, which does not dispatch `reloadStart`/`reloadComplete`, so the two paths don't interfere). |
| `4dd2f20` | Code review of PR #188. Fixed two real defects it found: the browser harness leaked its listening socket when Chromium failed to launch (so a first run without `npx playwright install chromium` hung instead of reporting why), and a blocked `localStorage` write wedged the theme toggle after one press. Both reproduced before fixing and pinned by tests. A third finding — `aria-checked` server-rendering as a bare attribute — stands as an upstream limitation; the suggested workaround was tried and is clobbered by the mixin. Browser suite now 17. |
| `b7c26a4` | Browser sweep of the whole UI after the `data-rmx-document` fix: every page loads and hydrates, locale round-trip, catalog → ETF detail, sidebar nav, mobile overlay — all good. Added page smoke tests and pinned that `data-navigation-loading` overrides the document opt-out (measured; the enhancement `preventDefault()`s and calls Remix `navigate()`, so those links frame-swap by design). Browser suite now 16. |
| `bd7977e` | Fixed `rmx-document` → `data-rmx-document` (the opt-out was silently inert on rc.2, so every nav link was doing a frame swap instead of a document load). Proved native form navigation can replace `FrameSubmitEnhancement`'s mechanics, then reverted it — see *Next step*. Added characterization browser tests for the frame-submit flows. |
| `18ed0a2` | Measured `remix/ui/popover` against the sidebar and ruled it out (reason 3); `app/lib/scroll-lock.js` stays and its deletion trigger was corrected. Added `npm run test:browser` (Playwright) and the sidebar's first real tests. |
| `d5ebc10` | Theme toggle moved onto `remix/ui/toggle/primitives`; `theme-toggle.tsx` folded into the client entry. |

## Next step

**Portfolio CSV import, route-consolidation-first** (`/portfolio/import` vs.
`/portfolio`) — the same treatment catalog ETF analysis just got. Consolidate
onto a shared path first (`import-etf-form` posts to a different route than
the portfolio page), then add `data-rmx-target` + a client entry following
`catalog-etf-analysis-frame.component.js` / `guidelines-list-frame.component.js`
as the reference shape. Lower priority than the rest of the backlog below
since it's a single low-frequency form, not blocking anything else — pick
whichever is more useful next.

Whichever form is ported next: check whether any of its non-2xx responses can
be ≥ 500. `@remix-run/ui`'s `defaultResolveFrame` throws for any such status
regardless of content type, silently dropping the HTML error fragment — see
the decision recorded below. Portfolio CSV import's failure responses are
already 422/UI-flash shaped, so this likely doesn't apply there, but confirm
rather than assume.

## Backlog after that, in order

1. Portfolio CSV import per *Next step* above. Advice's 3 forms need no route
   change (`form('advice')` already gives them one path) — just the
   `data-rmx-target` + client-entry port itself, including its two special
   cases (the gist-stale branch, `POST + reload-src` mode instead of
   replace-from-response). Advice's whole-page 503 (`advice/index.ts`'s `run`
   action, on an OpenAI failure) is a full document response, not a frame
   fetch, so the ≥ 500 frame limitation below doesn't apply to it.
2. Delete whatever is left of `frame-submit.component.js` beyond the
   app-specific UX layer, and shrink `frame-submit-request.ts` if the `Accept`
   branching collapses.
3. `tabs-nav` → `tabs/primitives`: expected to go the way of the sidebar
   (`tab` requires an `HTMLButtonElement`, the provider switches panels
   client-side, ours is `<a>` navigation between pages). Worth a measured
   attempt so it is recorded with evidence rather than predicted.
4. Stage 7 — `remix/ui/button` / `remix/ui/input`, then the dev tooling swaps.

## Decisions already taken — do not relitigate

- **Sidebar keeps its hand-rolled overlay.** Measured, reason 3. Plan §6.
- **`select/primitives` is not adopted** for `locale-select` / `select-input`:
  it replaces a native `<select>` with a button + div listbox + hidden input,
  against AGENTS.md's "native browser primitives before custom JavaScript".
  Reason 2, not a fit question.
- **`locale-select` is not worth porting to the `on()` mixin** on its own: more
  lines and less typecheck coverage for an element-scoped listener, and it
  would not let us delete `app/lib/event-listeners.js` (7 of the 8 remaining
  call sites are genuine document-level delegation, which the plan sanctions).
- **Playwright is in** as a dev dependency. It ships no postinstall, so `npm ci`
  never downloads a browser on its own. Browser tests stay out of `npm test`
  deliberately; CI runs them as a separate `browser-test` job
  (`.github/workflows/ci.yml`) that installs Chromium itself (cached by
  Playwright version) and runs `npm run test:browser`.
- **`render()` from `remix/ui/test` is unusable here** — it mounts into
  `document.body` and upstream drives it with Playwright. Server-render
  assertions plus `*.browser.ts` are the replacement for source-text tests.
- **No server change needed for the `data-rmx-target` port.** The default
  frame resolver's request (`Accept: text/html`, 4xx-with-HTML accepted) is
  exactly what `requestAcceptsFrameSubmitHtml` and the existing 422 fragment
  responses already assume. Confirm this holds for each remaining
  replace-from-response form before assuming it's universal — it follows from
  those two matching, not from the runtime generally.
- **`reloadStart`/`reloadComplete` carry no response data.** A form's
  success/failure UX (reset-on-success, keep-values-on-error) has to be
  inferred from the DOM after the swap — the portfolio port checks for the
  `role="alert"` node its own error fragment renders. Each ported form needs
  its own tell; don't assume `role="alert"` generalizes without checking that
  form's fragment.
- **`reloadStart`/`reloadComplete` fire for any reload of the named frame,
  not only ones this form's own submit caused.** A same-page soft navigation
  elsewhere on the page (e.g. the locale `<select>`) reuses the persisted
  `Frame` and dispatches an "inherited" reload on it too — confirmed live,
  reachable by just switching language with unsaved trade-form input. Gate
  the frame-event handlers on a `submit` event of the specific form first
  (`pendingSubmit` in `PortfolioTradeFormFrame` / `GuidelinesListFrame`); do
  not react to `reloadStart`/`reloadComplete` unconditionally in any per-form
  frame hook.
- **A `data-rmx-target` form's `action` must equal its page's own path, or
  the address bar drifts to a route that 405s on GET.** Confirmed live on
  guidelines before the fix (Plan §7). The standard from here on: one
  `form('<feature>')` route per feature (`index` + `action` at the same
  URL — `remix/routes`' own shorthand, first used by `advice`) with a
  hidden intent field (`adviceIntent`, `guidelineIntent`, …) discriminating
  sub-actions inside the single `action` handler. Full writeup:
  `docs/UI_ARCHITECTURE_GUIDELINES.md` §10. Check this *before* wiring
  `data-rmx-target` on any form, not after.
- **A frame-wide client entry, not a per-form one, is the right shape once a
  page has more than one `data-rmx-target` form sharing a frame.**
  `GuidelinesListFrame` hooks a single document-level `submit` listener plus
  the named frame's `reloadStart`/`reloadComplete`, and dispatches on
  whichever tracked form/control last submitted — covering the 2 external
  add-forms and the 2 per-row forms re-rendered inside the frame on every
  reload, in one file. `PortfolioTradeFormFrame` (one form, one page) is
  the special case, not the template, for any page adopting a second
  `data-rmx-target` form on the same frame.
- **The busy-state/reset/dialog-close UX layer is hand-rolled under reason 1,
  confirmed on the second port.** `FrameHandle` exposes only `src`, `reload()`,
  `replace()` and two payload-less events; `remix/ui/button`'s `button()`
  mixin is CSS-only. Neither carries a submission-status or pending-UI
  concept, so there's nothing in rc.2 to adopt instead of
  `watchFrameFormSubmissions` (`app/components/client/frame-form-ux.component.js`,
  shared by `PortfolioTradeFormFrame` and `GuidelinesListFrame`). Re-check
  this against whatever Remix build is current if a third form-frame port
  is ever tempted to hand-roll its own copy again instead of calling it.
- **Deleting a row whose own confirmation `<dialog>` is `showModal()`-open
  needs an explicit close before/around the frame swap.** The rc.2 diff
  (`@remix-run/ui`'s `diff-dom`) treats a `<dialog>`'s `open` attribute as
  live state it preserves across a patch, same as `<input>` `value`/
  `checked` — without an explicit close, a dialog whose row survives the
  swap would stay stuck open, and (measured) a dialog whose row does *not*
  survive can otherwise interact oddly with the diff given the browser's own
  top-layer handling of a modal being removed. `GuidelinesListFrame` closes
  every open `<dialog>` on `reloadStart`, gated on `pendingSubmit` so it
  only fires for a reload this page's own forms caused. Verified in
  Chromium: the delete-confirmation dialog for the deleted row closes
  cleanly, `document.querySelectorAll('dialog[open]').length` is `0`
  afterward.
- **A `data-rmx-target` frame's error responses must stay below status 500.**
  `@remix-run/ui`'s `defaultResolveFrame` (`runtime/run.ts`) throws for any
  response status ≥ 500 regardless of content type — unlike the 4xx range,
  which it renders whenever the body is HTML. The frame's own `render()` never
  runs in that case, so an HTML error fragment at 503 is silently dropped; the
  named frame's `reloadComplete` still fires (in a `finally`), so
  `watchFrameFormSubmissions`'s "no `role=\"alert\"` present" success tell
  reads a dropped error as success. Confirmed live on the catalog ETF analysis
  port: a mocked OpenAI failure at its original 503 left the frame unchanged
  and the browser test's `[role="alert"]` wait timed out; switching that
  response to 200 (`catalogEtfController`'s `action` in
  `app/features/catalog/index.ts`) fixed it with no other change. Every
  `data-rmx-target` form's non-2xx responses need the same check before
  porting — 4xx is fine as-is (422/403/404 all already render correctly), only
  ≥ 500 needs remapping, and only when the response is reached through a frame
  fetch rather than a full document response (advice's whole-page 503 is the
  latter and is unaffected — see the backlog above).

## Open questions for the user

None right now. Plan Open question 4 (how to unblock `data-rmx-target` form
ports whose action isn't their own page) is resolved — see *Next step*
above and `docs/REMIX_RC_MIGRATION_PLAN.md` Open question 4.
