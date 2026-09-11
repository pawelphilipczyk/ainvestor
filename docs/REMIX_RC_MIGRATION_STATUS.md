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
- **Green:** `npm run check`, `npm run typecheck`, `npm test` (582) and
  `npm run test:browser` (18) all pass.
- **Working style:** small steps. One component or one flow per commit, each
  landing green, each with its own browser coverage where the change is
  client-side.

## Done on this branch, most recent first

| Commit | What |
|---|---|
| `(pending)` | Attempted the next step exactly as written below (guidelines ×4, `data-rmx-target` + a `GuidelinesListFrame` client entry mirroring `PortfolioTradeFormFrame`). It worked mechanically — list updates, `role="alert"` tell generalized — but every one of the four actions (`/guidelines/instrument`, `/guidelines/asset-class`, `/guidelines/:id/target`, `/guidelines/:id`) is a path distinct from the page (`/guidelines`), and confirmed live that `data-rmx-target` still commits the form's `action` as the document URL regardless of `target` (`GET /guidelines/instrument` afterwards → 405). Portfolio's port only avoided this because `portfolio.create` happens to POST to `/portfolio`, same as the page. Traced the mechanism in `@remix-run/ui`'s `runtime/navigation.ts` — no attribute pins the document URL while frame-targeting elsewhere. Reverted the port rather than ship a broken refresh/back-button; wrote the finding up as Plan §7 (new bullet after the portfolio one) and Open question 4, since it blocks every remaining form in the backlog below, not just guidelines. Still 582/582, still 18/18 browser. |
| `6265ddf` | Ported the portfolio trade form (`#portfolio-trade-form`) from `FrameSubmitEnhancement` to native `data-rmx-target="portfolio-list"`. The server side needed no change — the default frame resolver's `Accept: text/html` request already matches `requestAcceptsFrameSubmitHtml`, and it accepts 4xx HTML responses, so the existing 422 inline-error fragment (`list-fragment.tsx`'s `role="alert"` banner) renders into the frame unmodified. Added `PortfolioTradeFormFrame`, a client entry that hooks `data-reset-form` and `setSubmitButtonLoading` onto the frame's `reloadStart` / `reloadComplete` events (`handle.frames.get('portfolio-list')`) instead of our own `submit` interception; since the event carries no response data, it tells success from failure by checking for the `role="alert"` node the error fragment renders (the only one on this page) so a 422 no longer clears the form. Added the 422 characterization test first (per the prior *Next step*), confirmed it green against the old enhancement, then ported and reran it unchanged — plus a new assertion that the form field keeps its value after a 422. Browser suite now 18. Import-etf-form stays on `FrameSubmitEnhancement` (still targets the same `portfolio-list` frame via `replace()`, which does not dispatch `reloadStart`/`reloadComplete`, so the two paths don't interfere). |
| `4dd2f20` | Code review of PR #188. Fixed two real defects it found: the browser harness leaked its listening socket when Chromium failed to launch (so a first run without `npx playwright install chromium` hung instead of reporting why), and a blocked `localStorage` write wedged the theme toggle after one press. Both reproduced before fixing and pinned by tests. A third finding — `aria-checked` server-rendering as a bare attribute — stands as an upstream limitation; the suggested workaround was tried and is clobbered by the mixin. Browser suite now 17. |
| `b7c26a4` | Browser sweep of the whole UI after the `data-rmx-document` fix: every page loads and hydrates, locale round-trip, catalog → ETF detail, sidebar nav, mobile overlay — all good. Added page smoke tests and pinned that `data-navigation-loading` overrides the document opt-out (measured; the enhancement `preventDefault()`s and calls Remix `navigate()`, so those links frame-swap by design). Browser suite now 16. |
| `bd7977e` | Fixed `rmx-document` → `data-rmx-document` (the opt-out was silently inert on rc.2, so every nav link was doing a frame swap instead of a document load). Proved native form navigation can replace `FrameSubmitEnhancement`'s mechanics, then reverted it — see *Next step*. Added characterization browser tests for the frame-submit flows. |
| `18ed0a2` | Measured `remix/ui/popover` against the sidebar and ruled it out (reason 3); `app/lib/scroll-lock.js` stays and its deletion trigger was corrected. Added `npm run test:browser` (Playwright) and the sidebar's first real tests. |
| `d5ebc10` | Theme toggle moved onto `remix/ui/toggle/primitives`; `theme-toggle.tsx` folded into the client entry. |

## Next step

**Blocked on a decision — see Open questions below before porting another
form.** The `role="alert"` tell and the `GuidelinesListFrame`-shaped shared
client entry both generalized fine; what doesn't is the document URL. Every
remaining form's action is a different path from its page (guidelines ×4,
catalog ETF analysis, portfolio CSV import, advice ×3), and `data-rmx-target`
has no way to submit to one of those without the address bar landing there
too — see Plan §7 for the traced mechanism and the three ways forward. Do not
attempt another form port under the current assumptions; pick (a), (b) or (c)
from Plan Open question 4 first.

If the answer is (a) — stay on `data-frame-submit` for everything except
portfolio's trade form — the remaining item in the backlog below is close to
already done: re-verify each mode still matches `FrameSubmitEnhancement`'s
contract (nothing here changed it) and move on to backlog items 2–4.

## Backlog after that, in order

1. ~~Carry the remaining forms across~~ — blocked, see *Next step*. If the
   resolution is to stay on `data-frame-submit` / `data-frame-replace-from-
   response` for everything but the portfolio trade form, this item is
   effectively closed rather than pending.
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
  (`pendingSubmit` in `PortfolioTradeFormFrame`); do not react to
  `reloadStart`/`reloadComplete` unconditionally in any per-form frame hook.

## Open questions for the user

1. **How to unblock the remaining `data-rmx-target` form ports** (Plan Open
   question 4). Every form left in the backlog posts to a path other than its
   own page, and `data-rmx-target` commits that path to the address bar
   regardless of which frame it targets — confirmed live (`GET
   /guidelines/instrument` → 405 after an add). Three options, increasing in
   invasiveness: (a) accept it and leave every remaining form on
   `data-frame-submit` — the portfolio trade form stays the one exception;
   (b) consolidate each feature's actions onto its own page's path (e.g. a
   single `POST /guidelines` dispatching on a hidden `intent` field) — a real
   routing/controller change, not mechanics, and a URL-shape change some
   other code or a bookmark could depend on; (c) wait and re-check whether a
   future Remix build adds a document-URL-pinning option for frame-targeted
   submissions. Recommend (a) unless the URL-shape change in (b) is wanted
   for its own sake — it costs nothing to keep the working `FrameSubmitEnhancement`
   path, and (b) is a scope increase beyond "adopt the framework's mechanics."
