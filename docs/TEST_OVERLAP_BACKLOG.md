# Test overlap backlog

Worked by the **Test health sweep** Routine (weekly, Wednesdays 22:00 UTC),
alongside the gap backlog in the same run. Process, statuses and the rules a
run must obey: `docs/TEST_HEALTH.md`.

**Next area to sweep:** 1 — `app/features/advice`
**Last swept:** 2026-09-16 (seed pass, whole-suite survey)

---

## Open items

### OV-001 — `parseAdviceCashAmount` tests re-test `parseLocaleDecimalString`
**Status:** `approved` · **Proposed:** 2026-09-16 · **Area:** advice

`app/features/advice/advice-openai.ts:301` is
`export const parseAdviceCashAmount = parseLocaleDecimalString` — a plain
re-export alias, no wrapping logic. Its two tests in
`app/features/advice/advice-openai.test.ts:688` and `:696` assert the same
behaviour as `app/lib/locale-decimal-input.test.ts:9` and `:20`, with the same
input vectors (`'2000'`, `' 2000 '`, `'2,000'`, `'2000.50'`, `'2.000,50'` /
`''`, `'abc'`, `'-1'`) — a strict subset: the lib test also covers `'12,5'`
and malformed separators.

**Action:** delete both cases from `advice-openai.test.ts`. Replace with one
assertion that the alias is the same function reference
(`assert.equal(parseAdviceCashAmount, parseLocaleDecimalString)`), so the day
someone gives the advice path its own parsing rules, the alias test fails and
the behaviour tests get written where they belong.

**Evidence is conclusive — verified at seed time; safe for the first run to act on.**

---

### OV-002 — compact-height classes asserted through two components
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** components

`applies compact height classes when compact is true` exists identically in
`app/components/forms/submit-button.test.ts` and
`app/components/forms/select-input.test.ts`. Both appear to be asserting the
output of the shared helper in `app/components/forms/form-control-classes.ts`,
which has **no direct test of its own** (see `GAP-004`).

**Triage question:** are both assertions really about the shared helper, or
does each component apply its own compact rules? If the former, test the
helper directly once and have each component test assert only that it *uses*
it. If the latter, this is not overlap — reject it.

**Pairs with `GAP-004`.** Do them in the same run if they turn out to be one change.

---

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

---

### OV-004 — `catalog.test.ts` may re-assert parse rules already unit-tested
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** catalog

`app/features/catalog/catalog.test.ts` is 39 cases / 1,219 lines in a single
flat `describe('ETF Catalog page')`, driving the feature over HTTP. Alongside
it, `app/features/catalog/lib.test.ts` has 36 unit cases over the same module's
pure functions (`parseBankJsonToCatalog`, `mergeBankIntoCatalog`,
`catalogMergeKey`, …).

**Triage question:** how many of the 39 HTTP cases differ from each other only
in *parsed input*, rather than in *route behaviour*? Those belong in
`lib.test.ts` (where they may already exist) and the HTTP layer needs only one
case proving the route reaches the parser. Note this is the largest test file
in the repo — sample it, list the specific case numbers, and propose them
individually rather than as one bulk deletion.

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

---

## Done

_Nothing yet._
