# Test overlap backlog

Worked by the **Test health sweep** Routine (weekly, Wednesdays 22:00 UTC),
alongside the gap backlog in the same run. Process, statuses and the rules a
run must obey: `docs/TEST_HEALTH.md`.

**Next area to sweep:** 4 — `app/features/portfolio`
**Last swept:** 2026-09-19 (guidelines)

---

## Open items

### OV-006 — guideline formatting asserted twice with the same input/output
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** advice

`app/features/advice/advice.test.ts:277-323` ("passes guidelines into the
advice prompt when they exist (gist-backed)") builds a guideline
`{ etfName: 'VTI', targetPct: 60, etfType: 'equity' }` via the private-gist
overlay and asserts `capturedUserMessage` matches `/VTI.*60%/` and
`/equity/`. `app/features/advice/advice-openai.test.ts:252-301` ("includes
guidelines as target allocation in the user message") uses the identical
guideline shape (VTI/60%/equity, plus BND/30%/bond) fed directly to
`getInvestmentAdvice`, and asserts the same `/VTI.*60%/`-style output plus
more (`/BND.*30%/`, `/bond/`, `/split of the new cash alone/i`,
`/whole ETF portfolio/i`). The route test's assertions are a strict subset of
the unit test's over the same input→output mapping (`formatGuidelineLine`'s
"name target%" rendering), not just "same module touched."

**Triage question:** should `advice.test.ts:277-323` be thinned to assert
only that *some* guideline text made it into the prompt (e.g. `/VTI/` and one
target-pct digit, proving the gist→route wiring), leaving the detailed
phrasing assertions solely to `advice-openai.test.ts`? If the team considers
proving the literal percentage round-trips through the gist→prompt path a
distinct, valuable guarantee (catching a serialization bug in the
overlay/session layer a pure unit test can't reach), reject this as
intentional layered coverage instead.

Note: `formatGuidelineLine` (`advice-openai.ts:249`) itself has no direct
unit test — only exercised indirectly via these two prompt-content tests.
That's a gap, not overlap; logged for a future gap sweep rather than acted on
here.

### OV-003 — the `?tab=` no-JS browser test runs twice
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** browser layer

`no-JS: the initial tab from ?tab= still renders correctly server-side` appears
in both `app/features/advice/advice.browser.ts` and
`app/features/guidelines/guidelines.browser.ts`. If both are exercising the same
shared tabs primitive, this is a real Chromium launch spent twice on one rule —
browser tests are the most expensive thing in the suite.

**Triage question:** do advice and guidelines resolve the initial tab through
the same code path? If yes, keep one (guidelines has the denser tab coverage)
and drop the other. If each page resolves `?tab=` itself, keep both and reject.

**Note added 2026-09-19** (while sweeping `app/features/guidelines` — this is
the only overlap candidate touching that area, and it was already open here,
so not re-proposed): guidelines' tabs use the client-side
`remix/ui/tabs/primitives` pattern (mouse-click/keyboard switching with no
reload), while advice's tabs use a page-navigation/frame-reload pattern per
`guidelines.browser.ts:230-238`'s own doc comment — so the mouse-click and
keyboard-navigation cases in the two files are **not** duplicates of each
other (different mechanisms). Only the no-JS `?tab=` initial-render case is a
candidate duplicate, since both ultimately just assert the server-rendered
tab-panel markup for a given `?tab=` query param, which may share the same
underlying render helper. Whoever triages this next should check whether that
render helper is in fact shared before deciding.

---

### OV-005 — colliding test names across MCP tools
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** mcp/tools · **Priority:** low

`reads the pinned gist and returns the summary as JSON text` names a case in
both `mcp/tools/portfolio.test.ts` and `mcp/tools/guidelines.test.ts`. These
test different tools, so it is **not** duplicated coverage — but identical names
make a failure report ambiguous about which tool broke.

**Action:** rename to name the tool (`get_portfolio reads the pinned gist …`).
Cosmetic; do it as a rider on a run that is already touching these files, not
as a run's one change.

---

## Rejected

Runs **must** read this list before proposing, and must never re-propose an
item that appears here.

### RJ-001 — catalog TTL cache vs. MCP private-gist cache
**Rejected:** 2026-09-16 · **Reason:** deliberate parallel coverage, not overlap.

`hits GitHub once and returns independent clones while the cache entry is valid`
appears in both `app/features/catalog/lib.test.ts` and
`mcp/private-gist-cache.test.ts`. They cover **two separate cache
implementations**: the shared-catalog TTL cache in
`app/features/catalog/lib.ts:11`, and the private-gist cache in
`mcp/private-gist-cache.ts`, whose header comment states it deliberately
follows the former's shape and is *"kept inside mcp/ only … the web app must
not see this caching behaviour."* Two implementations need two tests. The
matching names reflect matching design, not copied coverage.

### RJ-002 — `app/lib/guidelines.test.ts` vs. `mcp/tools/guidelines.test.ts`
**Rejected:** 2026-09-16 · **Reason:** different layers, no shared assertions.

The `app/lib` file tests pure functions (`parseGuidelinesFromGist`,
`sumGuidelineTargetPercent`, `findGuidelineDuplicateOf`,
`buildGuidelinesGistPatch`). The `mcp/tools` file tests tool contracts
(argument validation, catalog cross-checks, the 100% cap surfaced as a tool
error, rejected writes). Same domain, disjoint assertions.

### RJ-003 — `OV-004`, `catalog.test.ts` vs. `lib.test.ts`
**Rejected:** 2026-09-17 · **Reason:** re-verified against a full read of both
files and the claim doesn't hold.

Re-checked every one of `catalog.test.ts`'s 39 HTTP cases against all 36
`lib.test.ts` unit cases, focused on the ~15 import-flow cases
(`catalog.test.ts:347-938`) that most resemble the pure
`parseBankJsonToCatalog`/`mergeBankIntoCatalog`/`catalogMergeKey` tests
(`lib.test.ts:250-712`). Found zero genuine strict-subset duplicate pairs:

- The JSON-parse try/catch, empty-paste-after-trim check, and the
  "0 rows extracted" branch (`catalog.test.ts:606,642,676`) all live inline
  in `app/features/catalog/index.ts`, not in `lib.ts` — `lib.test.ts` has no
  counterpart for any of them.
- `formatCatalogImportOutcomeFlash` (`index.ts:109`), the function that turns
  parse diagnostics into the flash text the HTTP cases actually assert
  (`catalog.test.ts:710,757,807,857,905`), has no direct unit test anywhere —
  even where a case's *input* shape matches a `lib.test.ts` scenario, the
  HTTP case's *assertions* are about the rendered strings, while
  `lib.test.ts`'s assertions are about the structural parse result. Different
  rule, different function, no existing pin for the former.
- The Accept:`application/json` vs. Accept:`text/html` cases
  (`catalog.test.ts:347,399` vs. `:565,606`) reuse the same input but assert a
  different response format — a distinct route branch, not overlap.
- The filter/search/risk-band HTTP cases (`catalog.test.ts:1096,1117,1156,1192`)
  look adjacent to `lib.test.ts`'s pure `riskBandFromRiskKid`/
  `parseCatalogRiskFilterParam`, but the actual "filter entries by band" logic
  lives inline in `catalog-list-fragment.tsx`, which `lib.test.ts` never
  exercises — not a duplicate.

The original proposal was speculative ("likely differ … only in parsed
input") and doesn't survive a full read. Note:
`formatCatalogImportOutcomeFlash`'s total lack of direct unit coverage is a
**gap**, not overlap — worth a future gap-backlog item, since right now it's
only exercised indirectly through ~8 expensive HTTP round-trips in
`catalog.test.ts`.

---

## Done

### OV-001 — `parseAdviceCashAmount` tests re-test `parseLocaleDecimalString`
**Status:** `done` · **Proposed:** 2026-09-16 · **Acted:** 2026-09-16 · **Area:** advice · **PR:** https://github.com/pawelphilipczyk/ainvestor/pull/203

`app/features/advice/advice-openai.ts:301` is
`export const parseAdviceCashAmount = parseLocaleDecimalString` — a plain
re-export alias, no wrapping logic. Its two tests in
`app/features/advice/advice-openai.test.ts:688` and `:696` asserted the same
behaviour as `app/lib/locale-decimal-input.test.ts:9` and `:20`, with the same
input vectors — a strict subset: the lib test also covers `'12,5'` and
malformed separators.

**Action taken:** deleted both cases from `advice-openai.test.ts`; replaced
with one assertion that the alias is the same function reference
(`assert.equal(parseAdviceCashAmount, parseLocaleDecimalString)`), so the day
someone gives the advice path its own parsing rules, the alias test fails and
the behaviour tests get written where they belong.

### OV-002 — compact-height classes asserted through two components
**Status:** `done` · **Proposed:** 2026-09-16 · **Approved:** 2026-09-17 ·
**Acted:** 2026-09-19 · **Area:** components · **PR:** https://github.com/pawelphilipczyk/ainvestor/pull/215

`applies compact height classes when compact is true` existed identically in
`app/components/forms/submit-button.test.ts` and
`app/components/forms/select-input.test.ts`, both asserting the literal
`h-9`/`min-h-9` content of the shared `formControlHeightCompact` constant
(`app/components/forms/form-control-classes.ts`) through each component's
one-line `compact` ternary (`submit-button.tsx:39-41`,
`select-input.tsx:43-45`) — a real, if small, duplicate of the constant's
value at two extra sites, on top of the direct pin added in
`app/components/forms/form-control-classes.test.ts` by `GAP-004`.

**Action taken:** rewrote both `it('applies compact height classes when
compact is true', …)` cases as `it('switches from the default to the compact
height tier when compact is true', …)`: each now renders both the
default-prop and `compact: true` variants and asserts, via the imported
`formControlHeightDefault`/`formControlHeightCompact` constants (not
hardcoded `h-9`/`h-10` literals), that the rendered classes flip from one
tier to the other. The literal height values stay pinned solely in
`form-control-classes.test.ts`; these two tests now only prove each
component *uses* the shared helper and reacts to `compact`.
