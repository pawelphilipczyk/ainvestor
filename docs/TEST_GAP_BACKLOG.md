# Test gap backlog

Worked by the **Test health sweep** Routine (weekly, Wednesdays 22:00 UTC),
alongside the overlap backlog in the same run. Process, statuses and the
rules a run must obey: `docs/TEST_HEALTH.md`.

**Next area to sweep:** 6 — `app/components` + shared browser layer
**Last swept:** 2026-09-16 (app/lib)

---

## How the seed items were found

A module is listed below when **no test file names it at all** — not in an
import, not in a string. That is a strict signal of *no direct coverage*; it is
**not** proof of no coverage. Several of these are middleware or helpers that
route-level tests exercise on every request without ever naming them.

So every seed item below is **untriaged**. A run's first job on one is to
answer: *is this reached by an existing test, and is that enough?* If a route
test already pins the behaviour that matters, reject the item with that test
named as the reason — do not add a second test for the same rule, or this
backlog just feeds the overlap backlog.

---

## Open items

### GAP-001 — session flash messages
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** `app/lib`

`app/lib/session-flash.ts` — no direct coverage. Flash messages are a
read-once-then-clear contract, and the failure mode (a message that survives
into the next request, or vanishes before it renders) is exactly what a unit
test catches and an integration test misses.

**Triage:** check whether any feature test asserts a flash surviving one
redirect and then being gone. If not, this is a genuine gap — start here.

### GAP-002 — upload limits and the multipart flash middleware
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** `app/lib`

`app/lib/multipart-upload-limits.ts` and
`app/lib/multipart-limit-flash-middleware.ts` — no direct coverage. This is the
oversized-upload path on catalog/portfolio import: the branch users only hit on
a bad day, so nobody exercises it by hand.

**Triage:** does any catalog import test POST a body over the limit? The
valuable case is the *rejection* — correct status, the flash reaching the next
render, no partial import.

### GAP-004 — shared form-control classes
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** `app/components`

`app/components/forms/form-control-classes.ts` — no direct coverage, while at
least two component tests assert its output indirectly (see `OV-002` in the
overlap backlog).

**Triage:** testing the helper once and thinning the component assertions is
one change that closes a gap and an overlap together. Coordinate with `OV-002`.

### GAP-005 — form payload and frame-submit request helpers
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** `app/lib`

`app/lib/form-data-payload.ts` and `app/lib/frame-submit-request.ts` — no direct
coverage. These sit on the boundary between the server-first forms and the
`data-rmx-target` client entries, the seam the RC migration has been moving
(`docs/REMIX_RC_MIGRATION_STATUS.md`).

**Triage:** likely well covered in effect by the `*.browser.ts` suites. Check
those first — if the behaviour is pinned there, prefer rejecting over adding a
unit test that repeats a browser assertion.

### GAP-006 — UI locale middleware and request context
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** `app/lib`

`app/lib/ui-locale-middleware.ts` and `app/lib/request-context.ts` — no direct
coverage. `app/lib/ui-locale.test.ts` exists but is 2 cases / 27 lines, and 16
test files reference `/locale`, so the *route* is well exercised.

**Triage:** the gap, if any, is in resolution order — cookie vs. session vs.
`Accept-Language` vs. default — and in context isolation between concurrent
requests. Check `ui-locale.test.ts` before writing anything.

### GAP-007 — section intros and ETF type helpers
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** `app/lib` · **Priority:** low

`app/lib/section-intros.ts` and `app/lib/etf-type.ts` — no direct coverage.
`AGENTS.md` has a specific rule for the first: `getSectionIntro(page)` must
resolve `t()` **at request time, not at module load**, so intros follow a locale
switch. That rule is testable and currently unpinned.

**Triage:** one test that switches locale between two `getSectionIntro` calls
would pin the documented rule. Low priority, small payoff, cheap.

### GAP-008 — MCP tool argument and result helpers
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** `mcp/tools`

`mcp/tools/tool-arguments.ts` and `mcp/tools/tool-result.ts` — no direct
coverage, though all six `mcp/tools/*.test.ts` files (116 cases) exercise them
on every call.

**Triage:** almost certainly covered in effect. The only gap worth closing is a
malformed-arguments edge the tool tests do not reach (wrong JSON types, missing
required fields, extra fields). If the tool tests already cover those, reject.

### GAP-009 — MCP stdout guard
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** `mcp` core

`mcp/stdout-guard.ts` — no direct coverage. On a stdio MCP transport, a stray
`console.log` corrupts the JSON-RPC stream, and the symptom is a client that
mysteriously disconnects. That is precisely a guard worth a test.

**Triage:** genuine gap unless `mcp/protocol.test.ts` covers it. Assert that a
write outside the protocol is intercepted rather than reaching stdout.

### GAP-010 — untested page components
**Status:** `blocked` · **Proposed:** 2026-09-16 · **Area:** all features

No test file names `catalog-page.tsx`, `catalog-etf-page.tsx`,
`guidelines-page.tsx`, `portfolio-page.tsx`, `advice-page.tsx`,
`intro-page.tsx`, `admin-etf-import-page.tsx`, or the fragment components
beside them.

**Blocked on a decision, not on work:** these are almost certainly rendered by
the route-level feature tests, which is the architecture working as intended —
`docs/UI_ARCHITECTURE_GUIDELINES.md` puts behaviour on the server, so the route
test *is* the component test. Adding component-level tests here would likely
manufacture overlap.

**Needs:** a yes/no on whether page components should ever be tested apart from
their route. Until then, runs should leave this alone. If the answer is no,
reject it and stop re-surfacing page components as gaps.

### GAP-011 — `formatValue`'s currency-fallback branch is untested
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** `app/lib`

`app/lib/format.ts:1-10` — no test file imports `format.ts` or names
`formatValue`/`formatPortfolioValueForInput`. `formatValue` is used in
`app/features/catalog/catalog-list-fragment.tsx:3,82` and
`app/features/portfolio/portfolio-operation-form/list-fragment.tsx:3,77`, and
`app/features/portfolio/portfolio.test.ts:151-224` renders those fragments
with `currency: 'PLN'`/`'USD'` and asserts the formatted string — but that
only exercises the `Intl.NumberFormat` success path.

The `catch` fallback (`` `${value} ${currency}` ``) is untested and reachable
in production: `app/lib/portfolio-operations.ts:22` validates `currency` as a
bare `string()` with no enum restriction (unlike `app/lib/currencies.ts`'s
`CURRENCIES` enum used only in the advice/add-ETF forms), so a hand-crafted
POST or an externally-edited gist can store a non-ISO-4217 currency string
that later reaches `formatValue` and would otherwise throw inside
`Intl.NumberFormat`.

**Triage:** genuine gap — write a unit test asserting
`formatValue(100, 'NOTACURRENCY')` (or similar) falls back to
`'100 NOTACURRENCY'` instead of throwing.

**Note:** `formatPortfolioValueForInput` in the same file appears to have no
production caller left (only its own definition matches a repo-wide grep) —
worth a look for removal rather than a test, separately from this item.

---

## Uncovered routes to check

Flagged during the seed survey; each needs the same triage before becoming an item.

| Route | Test files naming it | Note |
|---|---|---|
| `/catalog/fragments/list` | 0 | but `catalog-list-filter.browser.ts` exists — may reach it by another path |
| `/admin/etf-import` | 1 | admin-only page, thin coverage |
| `/health` | 2 | probably fine |

---

## Rejected

Runs **must** read this list before proposing, and must never re-propose an
item that appears here.

_Nothing yet._

---

## Done

### GAP-003 — guest session state
**Status:** `done` · **Proposed:** 2026-09-16 · **Acted:** 2026-09-16 · **Area:** `app/lib` · **PR:** (this PR)

`app/lib/guest-session-state.ts` had no direct coverage. Route-level tests
sign in first and only exercise the happy path for guests (seeding a guest
catalog/ETF list), so the module's own internal logic — the JSON-corruption
fallback, the guidelines LRU cache keyed by a session-held ref, and
per-session isolation — was unpinned.

**Action taken:** added `app/lib/guest-session-state.test.ts` (8 cases) using
a real `Session` from `sessionStorage.read(null)` (matching `session.test.ts`'s
convention): round-trips for guest ETFs/catalog/guidelines, that setting one
field doesn't clobber another already in the session, that a corrupted
stored value falls back to empty state instead of throwing (verified this
case fails if the `try/catch` in `readState` is removed), that the
guidelines ref is reused across writes in one session, that clearing the
server-side store empties previously-cached guidelines, and that two
sessions don't share a guidelines cache entry.
