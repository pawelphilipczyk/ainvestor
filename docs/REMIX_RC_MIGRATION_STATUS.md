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
  through `2f8fcb6` (the portfolio trade form port, PR #189), are merged on
  `main`.
- **Branch:** `claude/next-migration-step-fulvgt`, opened fresh off `main`
  after PR #189 merged.
- **Green:** `npm run check`, `npm run typecheck`, `npm test` (583) and
  `npm run test:browser` (24) all pass.
- **Working style:** small steps. One component or one flow per commit, each
  landing green, each with its own browser coverage where the change is
  client-side.

## Done on this branch, most recent first

| Commit | What |
|---|---|
| `(pending)` | Guidelines' 4 forms (add-instrument, add-bucket, update-target, delete) ported to native `data-rmx-target`. First attempt hit a real blocker: `data-rmx-target` commits the form's `action` as the document URL regardless of which frame it targets, and guidelines' four actions were nested paths distinct from `/guidelines` — confirmed live (`GET /guidelines/instrument` → 405 after an add). Resolved it rather than reverting under reason 3: consolidated `routes.ts`'s `guidelines` entry onto `...form('guidelines')` (one `index`/`action` GET+POST pair at `/guidelines`, the same first-party shape `advice` already used) and added a hidden `guidelineIntent` field (`addInstrument`/`addAssetClass`/`updateTarget`/`delete`) the single `action` handler switches on — same pattern as `advice`'s `adviceIntent`; `updateTarget`/`delete` take the row `id` as a hidden field instead of a path segment, and the `_method=DELETE` override is gone (no longer needed with one POST route). With every form's action now equal to the page, the `data-rmx-target` port (a `GuidelinesListFrame` client entry mirroring `PortfolioTradeFormFrame`, covering all 4 forms since it hooks the frame rather than one fixed form id) worked with no URL drift. Wrote the pattern up as the project standard in `docs/UI_ARCHITECTURE_GUIDELINES.md` §10, and closed Plan Open question 4 (chose option (b)). `npm test` 583/583, `npm run test:browser` 24/24 (5 new: add success/reset, add 422/no-reset, update-target, delete-via-dialog closes its own dialog, unrelated-reload doesn't clear the form). |
| `6265ddf` | Ported the portfolio trade form (`#portfolio-trade-form`) from `FrameSubmitEnhancement` to native `data-rmx-target="portfolio-list"`. The server side needed no change — the default frame resolver's `Accept: text/html` request already matches `requestAcceptsFrameSubmitHtml`, and it accepts 4xx HTML responses, so the existing 422 inline-error fragment (`list-fragment.tsx`'s `role="alert"` banner) renders into the frame unmodified. Added `PortfolioTradeFormFrame`, a client entry that hooks `data-reset-form` and `setSubmitButtonLoading` onto the frame's `reloadStart` / `reloadComplete` events (`handle.frames.get('portfolio-list')`) instead of our own `submit` interception; since the event carries no response data, it tells success from failure by checking for the `role="alert"` node the error fragment renders (the only one on this page) so a 422 no longer clears the form. Added the 422 characterization test first (per the prior *Next step*), confirmed it green against the old enhancement, then ported and reran it unchanged — plus a new assertion that the form field keeps its value after a 422. Browser suite now 18. Import-etf-form stays on `FrameSubmitEnhancement` (still targets the same `portfolio-list` frame via `replace()`, which does not dispatch `reloadStart`/`reloadComplete`, so the two paths don't interfere). |
| `4dd2f20` | Code review of PR #188. Fixed two real defects it found: the browser harness leaked its listening socket when Chromium failed to launch (so a first run without `npx playwright install chromium` hung instead of reporting why), and a blocked `localStorage` write wedged the theme toggle after one press. Both reproduced before fixing and pinned by tests. A third finding — `aria-checked` server-rendering as a bare attribute — stands as an upstream limitation; the suggested workaround was tried and is clobbered by the mixin. Browser suite now 17. |
| `b7c26a4` | Browser sweep of the whole UI after the `data-rmx-document` fix: every page loads and hydrates, locale round-trip, catalog → ETF detail, sidebar nav, mobile overlay — all good. Added page smoke tests and pinned that `data-navigation-loading` overrides the document opt-out (measured; the enhancement `preventDefault()`s and calls Remix `navigate()`, so those links frame-swap by design). Browser suite now 16. |
| `bd7977e` | Fixed `rmx-document` → `data-rmx-document` (the opt-out was silently inert on rc.2, so every nav link was doing a frame swap instead of a document load). Proved native form navigation can replace `FrameSubmitEnhancement`'s mechanics, then reverted it — see *Next step*. Added characterization browser tests for the frame-submit flows. |
| `18ed0a2` | Measured `remix/ui/popover` against the sidebar and ruled it out (reason 3); `app/lib/scroll-lock.js` stays and its deletion trigger was corrected. Added `npm run test:browser` (Playwright) and the sidebar's first real tests. |
| `d5ebc10` | Theme toggle moved onto `remix/ui/toggle/primitives`; `theme-toggle.tsx` folded into the client entry. |

## Next step

**Carry the next feature's forms across, route-consolidation-first.** The
pattern is now proven twice (advice, guidelines) and written up as the
standard in `docs/UI_ARCHITECTURE_GUIDELINES.md` §10. Catalog ETF analysis is
next — its one form (`data-frame-hide-form-on-success`, a wrinkle no prior
form has needed) currently posts to `/catalog/etf/:id/analysis`, a path
distinct from its page (`/catalog/etf/:id`). Before touching
`data-rmx-target`:

1. Consolidate `catalog`'s routes so the ETF detail page and its analysis
   action share one path — a `form('catalog/etf/:catalogEntryId')`-shaped
   pair, or fold `etfAnalysis` into the existing `etf` route as a POST
   action — with a hidden intent field if the route ends up serving more
   than one POST purpose.
2. Only then add `data-rmx-target` + a client entry for the reset/busy-state
   tell, following `guidelines-list-frame.component.js` as the reference
   shape (one entry per page, hooking the frame rather than a fixed form id,
   so it is ready if the page grows more forms later).

Portfolio CSV import needs the identical route-consolidation-first treatment
after that (`/portfolio/import` vs. `/portfolio`) — lower priority since it's
a single low-frequency form, not blocking anything else.

## Backlog after that, in order

1. Catalog ETF analysis, then portfolio CSV import — both per *Next step*
   above. Advice's 3 forms need no route change (`form('advice')` already
   gives them one path) — just the `data-rmx-target` + client-entry port
   itself, including its two special cases (the gist-stale branch, `POST +
   reload-src` mode instead of replace-from-response).
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
  never downloads a browser and CI is unaffected. Browser tests stay out of
  `npm test` deliberately.
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

## Open questions for the user

None right now. Plan Open question 4 (how to unblock `data-rmx-target` form
ports whose action isn't their own page) is resolved — see *Next step*
above and `docs/REMIX_RC_MIGRATION_PLAN.md` Open question 4.
