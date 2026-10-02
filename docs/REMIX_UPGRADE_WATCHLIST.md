# Remix upgrade watchlist

**Read this when bumping Remix to a new RC, minor or major.** It lists the
decisions this app took *because of how the framework behaves today*, so a
release that changes that behavior does not go unnoticed. Everything here was
measured, not assumed; each entry says what to re-measure and what result would
flip the decision.

Current pin: **`remix@^3.0.0`** (`package.json`).

This file exists because the alternative is rediscovery. Both migrations that
got us here closed with items deferred for good reasons, and a deferred item
with no trigger attached is indistinguishable from a forgotten one.

## How to use it on an upgrade

1. Read the changelog between the old pin and the new one.
2. Walk the **Gated on an upstream change** table below. For each row, check
   whether the release touches what it names. If it does, re-run the check in
   its *How to re-measure* column.
3. Give the **Cheap to re-check** rows one pass each — they are not blocked on
   anything specific, but a release is the natural moment to look.
4. Update the row (or delete it, if the decision is now settled for good) in
   the same commit as the bump, and mirror anything load-bearing into
   `docs/REMIX_RC_MIGRATION_STATUS.md`'s *Decisions already taken*.
5. Leave the **Settled on our own grounds** list alone unless *our* rules
   changed. A Remix release is not the trigger for those.

---

## Gated on an upstream change

These are waiting on something specific. Until it lands, they are closed
measurements, not open questions.

### 1. `button` / `input` — not in `@remix-run/ui` at all

**Decision:** not adopted, reason 2. **Waiting on:** a headless
`button` / `input` tier, as every other primitive this app adopted (tabs,
toggle, select) already has.

As of 3.0.0 neither tier ships: `remix` no longer has `remix/ui/*`, and
`@remix-run/ui` (0.12.x) exports no `button` or `input`. Before that the
styled tier lived in a dedicated `@layer rmx.<hash>` via
`document.adoptedStyleSheets`, and a cascade layer wins or loses as a whole,
so there was never a partial adoption — the cascade-layer finding is settled.

**How to re-measure:** check whether `@remix-run/ui/button` and
`@remix-run/ui/input` resolve (look at its `exports`). If a headless tier
appears, this reopens against `submit-button.tsx` and the three input
components. A styled-only tier leaves the decision unchanged.

**Full trace:** `docs/REMIX_RC_MIGRATION_PLAN.md` Open question 2 (RESOLVED).

### 2. `hmr.moduleImporter` — waiting on a wiring that needs no hand-maintained map

**Decision:** off. **Waiting on:** the HMR client's own imports reaching the
document import map without us hand-maintaining an entry.

Setting it the way Remix's template does breaks dev hydration completely: the
HMR client imports `/assets/npm/remix/dist/multiple-import-maps-polyfill.js`
(which serves 200), and *that* file is a one-line
`export * from '@remix-run/multiple-import-maps-polyfill'` the browser cannot
resolve — so every client entry fails to load. The document import map is
built from the *client entries'* module graphs, and the HMR client is not a
client entry.

The fix available today — hand-adding an import-map entry — puts back exactly
the `remix/*` ↔ `@remix-run/*` pair-maintenance that assets Stage 1 existed to
delete, so it stays off.

**How to re-measure:** set it, run `npm run dev` with `REMIX_NODE_HMR=1`, open
a page and check the console. Measured at rc.2: feeding all 19 client entries
to `getImportMap()` returns 55 specifiers, **none bare**. If a release makes
the polyfill resolve without a hand-maintained entry, adopt it.

**Cost of leaving it off:** dev-only, and only for a hot update pulling in a
*newly added* bare specifier — that falls back to a second
`<script type="importmap">`, needing Chrome 133+.

**Full trace:** `docs/REMIX_ASSETS_MIGRATION_PLAN.md`, *Why `hmr.moduleImporter`
stays off*.

---

## Cheap to re-check on any release

Not blocked on anything named, but a release is the natural moment to spend a
few minutes. Neither is expected to flip.

- **`select/primitives`** — not adopted for `locale-select` / `select-input`.
  It replaces a native `<select>` with a button + div listbox + hidden input,
  against AGENTS.md's "native browser primitives before custom JavaScript".
  Only flips if upstream changes it to build on a real `<select>`; a version
  bump alone will not do it.
- **`@remix-run/ui/popover` vs the sidebar's hand-rolled overlay** — ruled out under
  reason 3 (`docs/REMIX_RC_MIGRATION_PLAN.md` §6), and `app/lib/scroll-lock.ts`
  stays with it. Worth one look if a release reworks `popover`.

---

## Settled on our own grounds — a Remix release is not the trigger

Listed so nobody re-opens them looking for deferred work. These turn on *this
app's* rules, not the framework's behavior; only our own requirements changing
would move them.

- **`tabs-nav.tsx` for real per-page navigation** — `tab()` is built for
  same-page view switching and unconditionally `preventDefault()`s Enter,
  breaking keyboard activation on an `<a href>` host. Moot in practice: every
  tab set the app has turned out to be genuinely same-page, so the file and
  `tabs-nav-scroll.component.js` were deleted. Nothing to revisit.
- **`locale-select` → the `on()` mixin** — more lines and less typecheck
  coverage for an element-scoped listener, and it would not let us delete
  `app/lib/event-listeners.js` anyway.
- **Browser-side HMR (`remix/component-hmr`)** — closed, adopted. The
  `staticFiles()` architecture that blocked it is gone. Do not re-open on the
  strength of the stale "not adopted" wording still quoted in
  `docs/REMIX_RC_MIGRATION_STATUS.md`'s *Decisions* section; that entry carries
  its own correction.
