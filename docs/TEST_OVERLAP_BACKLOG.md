# Test overlap backlog

Worked by the **Test health sweep** Routine (weekly, Wednesdays 22:00 UTC),
alongside the gap backlog in the same run. Process, statuses and the rules a
run must obey: `docs/TEST_HEALTH.md`.

**Next area to sweep:** 6 — `app/components` + shared browser layer
**Last swept:** 2026-09-24 (`app/lib`)

---

## Open items

### OV-007 — `formatEtfTypeLabel`'s Polish labels asserted twice with identical inputs
**Status:** `proposed` · **Proposed:** 2026-09-24 · **Area:** `app/lib`

`app/lib/guidelines.test.ts:24-30` (`'formatEtfTypeLabel uses Polish labels when
UI locale is pl'`) asserts, inside `runWithUiCopyContext({ locale: 'pl',
shellReturnPath: '/' }, …)`: `formatEtfTypeLabel('equity') === 'Akcje'`,
`formatEtfTypeLabel('bond') === 'Obligacje'`, and
`formatEtfTypeLabel('real_estate') === 'Nieruchomości'`.
`app/lib/ui-locale.test.ts:16-26` (`'formatEtfTypeLabel uses Polish
asset-class labels when UI is Polish'`) asserts, inside the same
`runWithUiCopyContext({ locale: 'pl', shellReturnPath: '/catalog' }, …)`:
`formatEtfTypeLabel('equity') === 'Akcje'` and
`formatEtfTypeLabel('real_estate') === 'Nieruchomości'` — byte-identical to
two of the three assertions in `guidelines.test.ts`, same function, same
locale context, same expected strings. `ui-locale.test.ts`'s pair is a strict
subset of `guidelines.test.ts`'s (which additionally covers `'bond'`); the
rest of that test (`t('catalog.table.name')`,
`format(t('guidelines.list.deleteAria.instrument'), …)`) is not duplicated
elsewhere.

**Triage question / suggested action:** thin `ui-locale.test.ts:16-26` to
drop the two `formatEtfTypeLabel` lines and keep only the `t()`/`format()`
propagation assertions that are genuinely its own, leaving
`guidelines.test.ts` as the sole place that pins `formatEtfTypeLabel`'s
locale behavior. Left at `proposed` for a human/later-run sanity check before
anyone edits `ui-locale.test.ts`.

### OV-008 — colliding test names in `app/lib/store/github-store.test.ts` vs `github-repo-store.test.ts`
**Status:** `proposed` · **Proposed:** 2026-09-24 · **Area:** `app/lib` · **Priority:** low

`'returns ok: false with the status on a rejected read'`
(`github-store.test.ts:91`, `github-repo-store.test.ts:150`) and `'returns
ok: false with the status and response on a rejected write'`
(`:327`, `:340`) share names across the two files. Checked both pairs
line-by-line: gist-backed `readFile`/`writeFile` (plain PATCH, no version) vs.
repo-backed `readFile`/`writeFile` (blob-sha versioning, `expectedVersion`/
409-conflict handling, directory-vs-file guard) exercise completely different
HTTP mechanics behind a matching result-shape interface — deliberate parallel
implementations, same reasoning as the already-rejected `RJ-001`. **Not** a
duplication; this is an `OV-005`-shaped naming-ambiguity note only, same
disposition (rename to name which store, not for action on its own).

### OV-006 — guideline formatting asserted twice with the same input/output
**Status:** `proposed` · **Proposed:** 2026-09-16 · **Area:** advice

`app/features/advice/advice.test.ts:277-323` ("passes guidelines into the
advice prompt when they exist (gist-backed)") builds a guideline
`{ etfName: 'VTI', targetPct: 60, etfType: 'equity' }` via the private-gist
overlay and asserts `capturedUserMessage` matches `/VTI.*60%/` and
`/equity/`. `app/features/advice/advice-openai.test.ts:253-302` ("includes
guidelines as target allocation in the user message") uses the identical
guideline shape (VTI/60%/equity, plus BND/30%/bond) fed directly to
`getInvestmentAdvice`, and asserts the same `/VTI.*60%/`-style output plus
more (`/BND.*30%/`, `/bond/`, `/split of the new cash alone/i`,
`/whole ETF portfolio/i`). The route test's assertions are a strict subset of
the unit test's over the same input→output mapping (`formatGuidelineLine`'s
"name target%" rendering), not just "same module touched."

**Re-verified 2026-09-20** (while sweeping `app/features/portfolio` — this
was the only open item worth re-checking during that pass): both tests still
exist exactly as described; only a one-line drift on the unit-test side —
the `advice-openai.test.ts` case actually runs lines 253-302, not 252-301
(corrected above). `formatGuidelineLine` (`advice-openai.ts:249`) still has
no direct test, called only at `advice-openai.ts:864` and `:932`. Evidence
holds, but the triage question below is a values judgment, not a factual
one, so this stays at `proposed` rather than being promoted — it needs a
human call on whether the gist→prompt round-trip guarantee is worth keeping
separately pinned.

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

---

## Rejected

Runs **must** read this list before proposing, and must never re-propose an
item that appears here.

### RJ-004 — the `?tab=` no-JS browser test in advice vs. guidelines
**Rejected:** 2026-09-20 · **Reason:** re-verified against a full read of both
pages' render paths; each resolves `?tab=` through a completely separate
mechanism, so this was never overlap.

Previously `OV-003`: `no-JS: the initial tab from ?tab= still renders
correctly server-side` appears in both `app/features/advice/advice.browser.ts:273-303`
and `app/features/guidelines/guidelines.browser.ts:324-341`. Traced both:

- **Advice:** `?tab=` is parsed by `parseAdviceTabParam`
  (`app/features/advice/index.ts:61-64`) →
  `renderAdvicePageResponse` (`:181-216`) wires a `Frame` whose `resolveFrame`
  calls `resolveAdviceResultFrame` (`:164-179`), which server-renders the
  `AdviceModePanel` component (`advice-page.tsx:640`, containing
  `#adviceModel-review` at `:737-741`) via
  `renderFragmentToStream(jsx(AdviceModePanel, …))`.
- **Guidelines:** `?tab=` is parsed by `normalizeGuidelinesAddTab`
  (`app/features/guidelines/index.ts:642-644`) → `renderGuidelinesPage`
  (`:696-730`) passes `activeAddTab` straight into `GuidelinesPage`'s body
  props (`:709-713`) — **not** through `resolveFrame` (guidelines'
  `resolveFrame` at `:721-728` only handles the unrelated guidelines-list
  Frame). Tab-content visibility instead comes from `GuidelinesTabs`
  (`guidelines-tabs.component.ts`), which sets `defaultActiveTab` on the
  shared `remix/ui/tabs/primitives` `Context` (`:22-26`); both panels render
  into the SSR'd HTML and the primitives library marks the inactive one
  hidden at render time.

Two structurally different mechanisms (Frame/fragment-stream indirection vs.
dual-render-with-hidden-attribute). The only shared import is the
framework-level `remix/ui/tabs/primitives`, and even that's used differently
(advice never calls its `panel()`; guidelines does). Per this item's own
stated triage fork ("if each page resolves `?tab=` itself, keep both and
reject"), the evidence lands on reject.

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

### OV-005 — colliding test names across MCP tools
**Status:** `done` · **Proposed:** 2026-09-16 · **Approved:** 2026-09-20 ·
**Acted:** 2026-09-24 · **Area:** mcp/tools · **Priority:** low · **PR:** https://github.com/pawelphilipczyk/ainvestor/pull/228

`reads the pinned gist and returns the summary as JSON text` named a case in
both `mcp/tools/portfolio.test.ts` and `mcp/tools/guidelines.test.ts`. Not
duplicated coverage (different tools) — but identical names made a failure
report ambiguous about which tool broke.

**Action taken:** renamed to `get_guidelines reads the pinned gist …`
(`mcp/tools/guidelines.test.ts:178`) and `get_portfolio reads the pinned
gist …` (`mcp/tools/portfolio.test.ts:237`).

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
