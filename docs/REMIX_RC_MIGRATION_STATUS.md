# Remix RC migration — working status

**Read this first when picking the migration back up.** It holds only *where we
are* and *what is next*. Every finding, measurement and decision rationale
lives in `docs/REMIX_RC_MIGRATION_PLAN.md`; this file points at it rather than
repeating it, so the two cannot drift.

Update this file in the same commit as the work it describes.

---

## Where we are

- **Stage:** 6 (behavior via primitives). Stages 1–5 are merged on `main`.
- **Branch:** `claude/migration-stage-6-k3d712` — Stage 6 commits stack here
  rather than going out as separate PRs off `main`.
- **PR:** <https://github.com/pawelphilipczyk/ainvestor/pull/188>, open against
  `main`. Further Stage 6 work keeps stacking onto this branch and lands in
  that PR; update its description when the diff moves on.
- **Green:** `npm run check`, `npm run typecheck`, `npm test` (581) and
  `npm run test:browser` (9) all pass.
- **Working style:** small steps. One component or one flow per commit, each
  landing green, each with its own browser coverage where the change is
  client-side.

## Done on this branch, most recent first

| Commit | What |
|---|---|
| `(this commit)` | Browser sweep of the whole UI after the `data-rmx-document` fix: every page loads and hydrates, locale round-trip, catalog → ETF detail, sidebar nav, mobile overlay — all good. Added page smoke tests and pinned that `data-navigation-loading` overrides the document opt-out (measured; the enhancement `preventDefault()`s and calls Remix `navigate()`, so those links frame-swap by design). Browser suite now 16. |
| `bd7977e` | Fixed `rmx-document` → `data-rmx-document` (the opt-out was silently inert on rc.2, so every nav link was doing a frame swap instead of a document load). Proved native form navigation can replace `FrameSubmitEnhancement`'s mechanics, then reverted it — see *Next step*. Added characterization browser tests for the frame-submit flows. |
| `18ed0a2` | Measured `remix/ui/popover` against the sidebar and ruled it out (reason 3); `app/lib/scroll-lock.js` stays and its deletion trigger was corrected. Added `npm run test:browser` (Playwright) and the sidebar's first real tests. |
| `d5ebc10` | Theme toggle moved onto `remix/ui/toggle/primitives`; `theme-toggle.tsx` folded into the client entry. |

## Next step

**Port the portfolio trade form to native form navigation** — one form, one
mode, the smallest slice that proves the part still unproven.

1. First extend `app/components/client/frame-submit.browser.ts` with the **422
   inline-error path** for that form (submit it invalid, assert the error
   surfaces in the list frame). The port must preserve it, and it is not
   covered yet.
2. Then swap the form's `data-frame-submit` / `data-frame-replace-from-response`
   for `data-rmx-target="portfolio-list"`, and re-hook the app-specific UX —
   `data-reset-form` and `setSubmitButtonLoading` — onto the frame's
   `reloadStart` / `reloadComplete` events instead of our own `submit`
   interception. `FrameHandle` is a `TypedEventTarget` with those two events;
   reach it from a client entry via `handle.frames.get('portfolio-list')`.
3. Leave the other ten forms on `FrameSubmitEnhancement` for now. Both paths
   coexist: the enhancement only acts on forms carrying `data-frame-submit`.

Done when the browser tests pass unchanged against the new path, including the
422 case and the form reset.

## Backlog after that, in order

1. Carry the remaining forms across, mode by mode: POST + replace-from-response
   (guidelines ×4, catalog ETF analysis), POST + reload-src (advice ×3), plain
   POST + reload (portfolio CSV import), GET + fragment action (catalog
   filters). The advice gist-stale branch and catalog's
   `data-frame-hide-form-on-success` are the two special cases.
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

## Open questions for the user

1. The `data-rmx-document` fix in `bd7977e` is a user-facing behavior fix
   sitting in a migration branch. It rides with PR #188 unless we lift it onto
   its own PR off `main` so it can ship sooner. Asked on the PR; unanswered.
