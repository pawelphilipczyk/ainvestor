# Test gap backlog

Worked by the **Test health sweep** Routine (weekly, Wednesdays 22:00 UTC),
alongside the overlap backlog in the same run. Process, statuses and the
rules a run must obey: `docs/TEST_HEALTH.md`.

**Next area to sweep:** 3 — `app/features/guidelines`
**Last swept:** 2026-10-05 (`app/features/catalog`)

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

### GAP-026 — `POST /catalog/import` failed-save branches are untested
**Status:** `proposed` · **Proposed:** 2026-10-05 · **Area:** `app/features/catalog`

`app/features/catalog/index.ts:~518-530` catches an `importBankCatalog` throw
and flashes `errors.catalog.import.saveFailed`; a `WriteConflictError` flashes
`changedElsewhere`; the JSON path returns 422. Only invalid JSON is tested
(`catalog.test.ts:415`); `lib.test.ts:348` and `:410` stop below the route.
Test: as admin, stub the repo write to 500 then to a conflict; assert the flash
or JSON error text.

### GAP-027 — HAR upload branch of `POST /catalog/import` is unexercised
**Status:** `proposed` · **Proposed:** 2026-10-05 · **Area:** `app/features/catalog`

`index.ts:453-468` handles `bankApiHar`: oversize (`fileTooLarge`), non-JSON
(`invalidHar`), no screener entry (`invalidHar`), valid import. Nothing posts
it; `catalog.test.ts:305` only checks the input exists, and
`har-bank-json-adapter.test.ts:47` pins the adapter alone.

### GAP-028 — catalog fragment/ETF route error branches
**Status:** `proposed` · **Proposed:** 2026-10-05 · **Area:** `app/features/catalog`

`GET /catalog/fragments/etf-analysis/:id` (`index.ts:386-407`): 404 for unknown
id and 403 for a pending session are untested (only 200 at
`catalog.test.ts:136`). `POST /catalog/etf/:id` (`:652-710`): unknown id 404,
JSON `model` passthrough/fallback to `DEFAULT_CATALOG_ETF_MODEL`, empty OpenAI
reply -> 200 with service error. `GET /catalog/etf/:id` for a pending session
(`:610`) should render `pendingBody` without the form.

### GAP-029 — `catalog-etf-back` and `catalog-filter-prefs` client entries have no browser test
**Status:** `proposed` · **Proposed:** 2026-10-05 · **Area:** `app/features/catalog` · **Priority:** low

`catalog-etf-back.component.ts` (history.back with modifier-key bypass and
location fallback) and `catalog-filter-prefs.component.ts` (localStorage
restore via `location.replace`, legacy-key migration) are only checked as
mounted (`catalog.test.ts:125`, `:1081`). Costlier browser test.

### GAP-025 — advice route tests read the real GitHub API for saved advice
**Status:** `done` · **Proposed:** 2026-10-01 · **Acted:** 2026-10-02 · **Area:** `app/features/advice` · **PR:** https://github.com/pawelphilipczyk/ainvestor/pull/242

Running the suite with `fetch` to `api.github.com` intercepted showed
`app/features/advice/advice.test.ts` (22) and `app/lib/remix-assets.test.ts`
(4, through the `/advice` page) sending 26 real requests per run, to
`octocat/ainvestor-data/contents/advice-*.json`. The saved-advice read went
past the in-process overlay: `setPrivateDataTestStore` covered holdings and
guidelines, while `advice-storage.ts` keeps its own `storageTestState`, which
those tests did not enable. They passed only because GitHub answered 401/404 for
the fake token, which the page treats as "nothing saved".

**Done:** `advice-storage.ts` now stays in memory whenever
`privateDataTestStoreHandles(token, dataRepo)` is true, so any test with a
test-store session is covered without opting in. `scripts/network-guard.mjs`
is preloaded into `npm test` / `npm run test:browser`: a fetch to
`api.github.com` or `github.com` throws, and the process exits non-zero even if
the app swallowed the error. Suites that install `installFakeDataRepo` replace
`fetch` themselves and are unaffected.

### GAP-022 — `formatGuidelineLine`'s fractional-percent rendering is unpinned (narrower sibling of `OV-006`)
**Status:** `proposed` · **Proposed:** 2026-09-26 · **Area:** `app/features/advice`

`OV-006` (overlap backlog) flagged `formatGuidelineLine`
(`app/features/advice/advice-openai.ts:249-254`) as having "no direct unit
test." Investigated concretely: the `if (kind === 'asset_class')` branch
itself is **not** a gap — a third indirect test not cited in `OV-006`,
`advice-openai.test.ts:334-381` ("formats hybrid asset-class and instrument
lines in the user message"), already exercises both branches.

What remains genuinely uncovered:
- **Fractional `targetPct`.** `GUIDELINE_TARGET_PERCENT_MIN = 0.001`
  (`app/lib/guidelines.ts:48`, no upper-bound-below-100 integer constraint)
  and the write-side valibot schema (`app/features/guidelines/index.ts:71-87`)
  legitimately accept decimals (e.g. `33.5`), but `formatGuidelineLine`
  interpolates `targetPct` raw with no rounding. Every guideline object across
  all three indirect tests (`advice.test.ts`, `advice-openai.test.ts`) uses a
  whole-number percentage — grepped every `targetPct:` value that flows
  through `formatGuidelineLine`/`getInvestmentAdvice`, none is fractional. A
  bug that mis-renders a fractional percentage (floating-point noise, silent
  truncation) would ship undetected.
- **Exact-string pinning.** All three indirect tests use `assert.match` with
  partial regexes (`/VTI.*60%/`, `/Asset class equity.*bucket/`), never the
  full literal line. A phrasing edit that keeps the ticker and percent in
  relative order would pass all three undetected.

**Triage:** genuine gap, narrower than `OV-006`'s framing. A direct
`describe('formatGuidelineLine', ...)` unit test importing the function,
asserting the exact returned string (`assert.equal`, not regex) for an
`instrument` row, an `asset_class` row, and a fractional `targetPct` (e.g.
`33.5` → `...33.5%...` verbatim, not rounded/truncated). Leave the two
`OV-006` prompt-content tests as they are — that item's own triage question
is unrelated and still open.

### GAP-023 — `parseAdviceDocument`'s schema-validation-failure branch is untested
**Status:** `done` · **Proposed:** 2026-09-26 · **Acted:** 2026-10-05 · **PR:** (this run's PR) · **Area:** `app/features/advice`

`app/features/advice/advice-document.ts:154-171` has three failure paths.
Two are tested: `raw == null`/empty content falls back to a paragraph
(`advice-openai.test.ts:199-224`, `:226-249`), and non-JSON text falls back to
a paragraph (`advice-openai.test.ts:113-128`). The third is not: JSON that
parses but fails `parseSafe(AdviceDocumentSchema, parsed)`
(`advice-document.ts:166-169`) — e.g. `{"blocks":[]}` (fails the "at least one
block" refine) or a block missing a required field — also falls back to a
paragraph, but no test anywhere feeds structurally-valid-but-schema-invalid
JSON through either call site (`advice-openai.ts:915,977`). Confirmed via a
repo-wide grep for `AdviceDocumentSchema`/`parseAdviceDocument`/`parseSafe` —
no other caller and no test exercises this specific branch.

**Triage:** genuine gap. Feed a mock OpenAI response of
`JSON.stringify({ blocks: [] })` (or a block missing a required field)
through `getInvestmentAdvice`, and assert the result falls back to
`{ type: 'paragraph', text: <the raw JSON string> }` rather than throwing or
silently accepting the invalid structure.

### GAP-024 — the unauthenticated `adviceStorageGate: 'sign_in'` banner is never reached by any test
**Status:** `proposed` · **Proposed:** 2026-09-26 · **Area:** `app/features/advice`

`app/features/advice/index.ts:328-337` (`adviceStorageGateProps`) returns
`{ adviceStorageGate: 'sign_in' }` when there is no session cookie at all — this
is the plain signed-out path, not guest mode (guest mode is confirmed fully
removed per `docs/STORAGE_MIGRATION_PLAN.md`, Phase 0). `advice-page.tsx:797-814`
renders this as a distinct banner (`t('advice.requiresRepo.title')`/`bodySignIn`/
`linkSignIn` → `routes.auth.login.href()`). Every one of the 28 requests in
`advice.test.ts` signs in first via `signInWithDataRepo()` or a pre-seeded cookie
jar — none hits `/advice` with zero session, so this banner's copy and link
are never rendered in any test.

The sibling `'connect_repo'` banner (signed in, no gist) *is* reached
(`advice.test.ts:333-365`), but that test only asserts the unrelated
form-level error string (`/private GitHub gist/`), never the banner's own
copy (`bodyConnectRepo`/`linkPortfolio`) — a softer, secondary gap.

**Triage:** genuine gap, user-visible (the copy every signed-out visitor to
`/advice` sees). A `GET /advice` request with no session cookie, asserting
`t('advice.requiresRepo.title')`/`bodySignIn`/the sign-in link href appear in
the body. Optionally extend the existing `:333` test with an assertion on
`bodyConnectRepo`/`linkPortfolio` in the same pass, rather than adding a
second test for that half.

### GAP-001 — session flash messages
**Status:** `done` · **Proposed:** 2026-09-16 · **Acted:** 2026-09-26 · **Area:** `app/lib` · **PR:** https://github.com/pawelphilipczyk/ainvestor/pull/232

`app/lib/session-flash.ts` — no direct coverage. Flash messages are a
read-once-then-clear contract, and the failure mode (a message that survives
into the next request, or vanishes before it renders) is exactly what a unit
test catches and an integration test misses.

**Re-checked 2026-09-26:** grepped every feature test file for
`flashBanner`/`readFlashedBanner`/`flash` usage — several route tests
(`catalog.test.ts:583-622` etc.) flash a banner via a `POST` and confirm it
renders on the immediately-following `GET`, but none does a *second*
follow-up request to confirm the banner is then gone, and none exercises the
legacy `error`-key fallback or the invalid-tone default branch (both dead in
production call sites, live in the function). Confirmed genuine gap, not
already covered in effect.

**Action taken:** added `app/lib/session-flash.test.ts` (6 cases), following
`session.test.ts`'s convention of round-tripping a real `Session` through
`sessionStorage.save()`/`sessionCookie.serialize()`/`parse()`/`read()` rather
than mocking. Covers: no-flash returns `undefined`; a flashed banner is
unreadable on the same request, readable on the next, and gone on the one
after that (pins the two-key `text`+`tone` composite surviving one hop
together, on top of the framework's own single-key flash guarantee); an
unrecognized flashed tone value falls back to `'info'`; a legacy `error`
flash takes priority over the modern keys; an empty flashed message is
treated as absent. Verified each assertion pins its exact branch by direct
inspection after the sandbox blocked running the suite against a
locally-modified copy of the source (same guard `GAP-008` hit) — inspected
`session-flash.ts:24-35` line by line against each assertion, then confirmed
via `git diff` that the temporary edit was fully reverted before this PR.
Production code was not modified in the final diff.

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
**Status:** `done` · **Proposed:** 2026-09-16 · **Acted:** 2026-09-17 · **Area:** `app/components` · **PR:** https://github.com/pawelphilipczyk/ainvestor/pull/205

`app/components/forms/form-control-classes.ts` — no direct coverage, while at
least two component tests assert its output indirectly (see `OV-002` in the
overlap backlog).

**Re-checked 2026-09-17:** confirmed. The module is pure string composition
(no branching); `submit-button.test.ts:16-22` and `select-input.test.ts:44-55`
both assert the literal content of `formControlHeightCompact` (`h-9 min-h-9`)
through each component's one-line `compact` ternary.

**Action taken:** added `app/components/forms/form-control-classes.test.ts`,
pinning the default/compact height constants directly and asserting each
composed control-classes export carries the right height tier and not the
other one. Left `submit-button.test.ts`/`select-input.test.ts` untouched —
thinning those is `OV-002`'s action (now `approved`), not this run's; only
one overlap action (already-approved-before-this-run) and one gap-filling
test are allowed per run, and `OV-002` only became `approved` during this
same run.

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
**Status:** `done` · **Proposed:** 2026-09-16 · **Acted:** 2026-09-20 · **Area:** `mcp/tools` · **PR:** https://github.com/pawelphilipczyk/ainvestor/pull/217

`mcp/tools/tool-arguments.ts` and `mcp/tools/tool-result.ts` — no direct
coverage, though all six `mcp/tools/*.test.ts` files (116 cases) exercise them
on every call.

**Triage:** almost certainly covered in effect. The only gap worth closing is a
malformed-arguments edge the tool tests do not reach (wrong JSON types, missing
required fields, extra fields). If the tool tests already cover those, reject.

**Re-verified 2026-09-20** (while sweeping `mcp/tools`, area 8): sharper than
originally framed. `jsonResult` (`tool-result.ts:4-8`) is pure and exercised
on all 116 cases via each file's `payloadOf()` helper — no gap. `readStringArgument`
(`tool-arguments.ts:8-16`) has its wrong-type/whitespace-only branches
directly asserted, but only through the `mode` argument
(`saved-advice.test.ts:191-202`, via `readAdviceAnalysisModeArgument`) — no
other call site (`ticker`, `id`, `query`, …) ever sends a non-string value
(confirmed by grep across `mcp/tools/*.test.ts` for `ticker: 0`/`null`/`true`
and equivalents — zero hits). But `readUiLocaleArgument`
(`tool-arguments.ts:23-34`) has **zero exercise, direct or indirect, in any
of the 116 cases** — `grep -ni "locale" mcp/tools/generate-advice.test.ts`
(its only caller, `generate-advice.ts:96`) returns no matches at all, so
neither its default branch, its valid-non-default branch (`'pl'`), nor its
invalid-value throw is asserted anywhere in the repo.

**Action taken:** added `mcp/tools/tool-arguments.test.ts` (9 cases), matching
the plain synchronous `describe`/`it` style already used for
`summarizeCatalogSearch` in `catalog.test.ts:87-154` (no gist stubbing needed
since both functions are pure). Covers `readStringArgument`'s trim/missing/
whitespace-only/wrong-type branches and `readUiLocaleArgument`'s
default-when-absent, default-when-null, valid-locale, invalid-string-locale
and wrong-type-locale branches — the last two asserting the exact
`"locale" must be one of: en, pl; got …` message the source throws. Verified
the throw-path assertions were sound by direct inspection of
`tool-arguments.ts:26-33` after a sandbox-classifier block prevented running
the suite against a locally-broken copy of the source (attempted twice —
first blocked as a shared-resource modification, then, after reverting and
retrying, blocked outright as a security-test-removal pattern, which is a
reasonable guard against exactly this kind of edit); each assertion encodes
the exact branch condition and error string from the source, so a regression
in any branch necessarily fails its assertion. Production code was not
modified in the final diff — confirmed via `git diff` showing no change to
`tool-arguments.ts`.

### GAP-009 — MCP stdout guard
**Status:** `done` · **Proposed:** 2026-09-16 · **Acted:** 2026-09-19 ·
**Area:** `mcp` core · **PR:** https://github.com/pawelphilipczyk/ainvestor/pull/215

`mcp/stdout-guard.ts` — no direct coverage. On a stdio MCP transport, a stray
`console.log` corrupts the JSON-RPC stream, and the symptom is a client that
mysteriously disconnects. That is precisely a guard worth a test.

**Re-checked 2026-09-19:** confirmed still a genuine gap. Grepped the whole
repo for `stdout-guard`/`stdoutGuard` — the only hits are `mcp/server.ts`'s
import and doc comment and `docs/MCP_SERVER_PLAN.md`'s layout listing, no test
file anywhere. No test imports `mcp/server.ts` (the only importer of the
guard), so there is no indirect path either — `mcp/protocol.test.ts` and
`mcp/http.test.ts` both drive `protocol.ts`/`http.ts` directly.

**Action taken:** added `mcp/stdout-guard.test.ts`. The module is
side-effect-only (`console.log = console.error` etc., no exports), so the
test installs spies on `process.stdout.write`/`process.stderr.write`, then
dynamically `import()`s the guard module (reproducing the "must be imported
first" ordering its own doc comment requires), asserts each patched
`console.*` method now === `console.error` by identity, then calls
`console.log`/`info`/`debug`/`dir`/`table` and asserts none of the five
reached `process.stdout.write` while all five reached
`process.stderr.write`. Verified the test fails for the right reason by
temporarily disabling the `console.log = console.error` line in
`mcp/stdout-guard.ts` locally (not committed) and confirming the identity
assertion fails, then restored the file untouched — production code was not
modified.

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

### GAP-012 — `NumberInput`'s no-`inputMode` and `numeric` branches are unreached
**Status:** `proposed` · **Proposed:** 2026-09-17 · **Area:** `app/components`

`app/components/forms/number-input.tsx` — no test file names it. All four
production call sites (`portfolio-operation-form/operation-form.tsx:79-86`,
`guidelines-page.tsx:109-116,157-164`, `guidelines-list-fragment.tsx:142-150`,
`advice-page.tsx:671-682`) pass `inputMode="decimal"` *and* an explicit
`pattern`, and route tests (`guidelines.test.ts:151-172`,
`portfolio.test.ts:180-184`) only assert `type="text"`/`inputmode="decimal"`,
never the `pattern` value or a case with `pattern` omitted. So
`defaultPatternForInputMode('numeric')` (no production caller uses
`inputMode="numeric"`), the `'decimal'` fallback pattern (every real caller
supplies its own `pattern`), and the plain `type="number"`/`min="0"`/
`step="any"` default branch (taken when `inputMode` is absent, also no
production caller) are all reachable code with zero coverage, direct or
indirect.

**Triage:** genuine gap — plain SSR component test (same pattern as
`submit-button.test.ts`), not a browser test: assert
`inputMode="decimal"` with no `pattern` renders the decimal fallback,
`inputMode="numeric"` renders `[0-9]*`, and no `inputMode` renders
`type="number" min="0" step="any"`.

### GAP-013 — plain-button spinner fallback in `submit-button-loading.component.js` is unpinned on guidelines' own buttons
**Status:** `proposed` · **Proposed:** 2026-09-17 · **Area:** shared browser layer

`setSubmitButtonLoading` (`app/components/client/submit-button-loading.component.js:64-92`)
has a fallback branch for a plain `<button type="submit">` with no
`.submit-button-busy-overlay` markup (clones `#form-spinner-icon` and swaps
`innerHTML`). The shared `SubmitButton` component's overlay path is covered
(`catalog-list-filter.browser.ts:120,132`, `catalog-etf-analysis.browser.ts:112`
assert `aria-busy`), but guidelines' own plain buttons — the save-target
button and the delete-confirmation button
(`guidelines-list-fragment.tsx:158-160,219-224`), wired through
`watchFrameFormSubmissions` (`frame-form-ux.component.js:39-103` via
`guidelines-list-frame.component.js:20`) — take this fallback branch, and
`guidelines.browser.ts` asserts form reset, dialog-close, and row
presence/URL but never `aria-busy`, `disabled`, or the spinner swap on these
buttons.

**Triage:** genuine gap, and hydration-only (`AGENTS.md`: client behavior
after hydration is invisible to `npm test`) — needs a `*.browser.ts` case,
added to `guidelines.browser.ts`: click the save-target or delete button,
assert `aria-busy="true"`/`disabled` while the request is in flight and that
both clear afterward, and that the visible label is swapped for the spinner
and restored.

### GAP-014 — `SectionIntroCard`'s `home-link` variant has no coverage
**Status:** `proposed` · **Proposed:** 2026-09-17 · **Area:** `app/components`

`app/components/data-display/section-intro-card.tsx:57-72` (the
`variant: 'home-link'` branch) is used by exactly one caller,
`app/features/intro/intro-page.tsx`. That page is one of `GAP-010`'s
`blocked` page components, but this item is a different question — a shared
*component's own branch*, not the page route. The two tests that `GET /`
(`sidebar.test.ts:144-233`, `theme-toggle.test.ts:52-87`) only assert
document-shell-level markup (import map, entry script, theme toggle), never
the home page body, so the `home-link` branch's `<a href data-rmx-document>`
wrapper and nested `Card` are asserted nowhere.

**Triage:** genuine gap, not a re-raise of `GAP-010` (that item stays
`blocked` on its own question). Plain server-render component test:
`renderToString(jsx(SectionIntroCard, { variant: 'home-link', … }))`,
asserting the anchor wrapper, `data-rmx-document`, and the nested `Card`. No
browser test needed.

### GAP-015 — `busy-control-overlay.ts`'s root/spinner classes are unpinned
**Status:** `proposed` · **Proposed:** 2026-09-17 · **Area:** `app/components`

`app/components/forms/busy-control-overlay.ts` — no test names it directly.
`busyControlOverlayClass`/`busyControlLabelClass` get indirect substring
coverage via `submit-button.test.ts:11-12`, but `busyControlRootStateClasses`
and `busyControlSpinnerClass` have no assertion anywhere — not in
`submit-button.test.ts`, not in `document-navigation.browser.ts` (asserts
`data-navigation-loading` but not the paired `busy-control-root`/`group`
classes), not for `frame-loading-placeholder.tsx`'s use of
`busyControlSpinnerClass`.

**Triage:** same shape as `GAP-004`/`OV-002` — a direct unit test of this
module's four exported class constants (plain string-content assertions)
closes it in one small test.

### GAP-016 — `getNavLinks()`'s "resolve at render time" rule is unpinned (sibling of `GAP-007`)
**Status:** `proposed` · **Proposed:** 2026-09-17 · **Area:** `app/components`

`app/components/layout/sidebar-nav.ts`'s doc comment states the same
render-time-not-import-time rule `AGENTS.md` documents for
`getSectionIntro` (`GAP-007`, still `proposed`), but no test switches the
active UI locale between two `getNavLinks()` calls in one test to prove
labels aren't resolved once at module load. No test in the repo asserts a
Polish nav label (`'Portfel'` etc. from `app/locales/pl.ts:33-36`) —
`sidebar.test.ts` calls `getNavLinks()` fresh each case but never under a
non-default locale, and `pages.browser.ts`'s live locale-switch test
(lines 50-76) only asserts `document.documentElement.lang` and the
`<select>` value, never sidebar link text.

**Triage:** genuine gap, identical rule to `GAP-007` applied to a second
helper — file as its sibling rather than a wholly new kind of item. Plain
unit test (server-side, not browser): call `getNavLinks()` under `'pl'`,
assert `'Portfel'` appears; switch to `'en'`, call again, assert
`'Portfolio'`.

### GAP-017 — `import_catalog_from_bank_file`'s own error branches are untested
**Status:** `proposed` · **Proposed:** 2026-09-20 · **Area:** `mcp/tools`

`mcp/tools/catalog-import.ts` is exercised via `catalog.test.ts:386-473`
(`describe('import_catalog_from_bank_file tool')`, preview vs. apply,
ownership refusal, missing file, no-`data`-array, not-an-object), but three
of the module's own error branches are reached nowhere in the repo:

- Oversized-file rejection (`catalog-import.ts:62-66`,
  `stats.size > MULTIPART_MAX_FILE_BYTES`) — no test writes a file over the
  limit.
- Invalid-JSON-content rejection (`catalog-import.ts:69-75`, the `JSON.parse`
  catch) — every test builds its fixture via `writeExport()`
  (`catalog.test.ts:388-393`), which always produces valid JSON.
- The "None of the N row(s) … could be imported" branch
  (`catalog-import.ts:109-113`, taken when `structuralIssue === null` but
  every row was skipped) — the one skip-only-row fixture
  (`{ fund_name: 'Missing ticker' }`, `catalog.test.ts:404`) is mixed with a
  valid row, so `parseResult.entries.length` is 1, never 0.

Confirmed via repo-wide grep for the distinguishing message fragments (`the
importer accepts up to`, `is not valid JSON`, `could be imported`) — zero
hits outside `catalog-import.ts` itself. This is a stdio-only local-file tool
with no other caller, so nothing exercises these indirectly.

**Triage:** genuine gap. A test would write an oversized temp file, an
invalid-JSON temp file, and an all-rows-invalid temp file, and assert each
produces the specific tool error.

### GAP-018 — `readOptionalEntryFields`'s wrong-type branch is untested
**Status:** `proposed` · **Proposed:** 2026-09-20 · **Area:** `mcp/tools`

`mcp/tools/catalog.ts:256`'s `` `"${name}" must be a number.` `` fires when
`risk_kid`/`rate_of_return` is present but not a number (e.g.
`risk_kid: 'abc'`). The only numeric-validation case sent
(`catalog.test.ts:344-357`, `risk_kid: 9`) is a valid *number* merely
out-of-range, which exercises the separate `validateCatalogEntry` →
`"risk_kid" must be a whole number from 1 to 7` path (`catalog.ts:307-308`)
instead. No test anywhere sends a wrong-type `risk_kid`/`rate_of_return`.

**Triage:** genuine gap — a test calling `upsert_catalog_entry` with
`risk_kid: 'abc'` (or similar) asserting the `"risk_kid" must be a number.`
error.

### GAP-019 — instrument guideline with no `ticker` is untested
**Status:** `proposed` · **Proposed:** 2026-09-20 · **Area:** `mcp/tools`

`mcp/tools/guidelines.ts:197-200`'s `buildGuidelineEntry` throws `'An
instrument guideline needs "ticker".'` when `kind === 'instrument'` and
`ticker` is absent. Every `kind: 'instrument'` call in `guidelines.test.ts`
(lines 129, 163, 242, 259, 274, 283) always supplies a ticker. `set_guideline`
is called only from `guidelines.test.ts` and merely named (not called) in
`mcp/http.test.ts:251` (a tool-listing assertion). No indirect coverage.

**Triage:** genuine gap — a `set_guideline` call with `kind: 'instrument'`
and no `ticker`, asserting the specific error text.

### GAP-020 — `generate_advice`'s `save` wrong-type branch is untested
**Status:** `proposed` · **Proposed:** 2026-09-20 · **Area:** `mcp/tools`

`mcp/tools/generate-advice.ts:78-85`'s `` `"save" must be a boolean; got …` ``
error is unreached — `generate-advice.test.ts` only ever passes `save: false`
(line 131) or omits the field entirely; no case passes a non-boolean like
`save: 'yes'`.

**Triage:** genuine gap — a `generate_advice` call with `save: 'yes'` (or
similar), asserting the specific error text.

### GAP-021 — `record_operation`'s own message-building branches are only partly covered
**Status:** `proposed` · **Proposed:** 2026-09-20 · **Area:** `mcp/tools` · **Priority:** low

Two branches in `mcp/tools/portfolio.ts`, lower-confidence than GAP-017–020
since the underlying logic they wrap is already pinned elsewhere — flagging
as a triage question rather than a firm claim:

- `explainOperationBlocker`'s `'sell_no_holding'` case (`portfolio.ts:139-140`,
  `"No holding matches … Call get_portfolio …"`) is never reached in
  `portfolio.test.ts` (the only sell-refusal case there is
  `sell_exceeds_holdings`, `portfolio.test.ts:434-452`). The `blocker:
  'sell_no_holding'` *value* is pinned directly in
  `app/lib/portfolio-operations.test.ts:182`, but that only asserts the
  structural enum from `applyPortfolioOperation`, never the MCP tool's own
  model-facing message text built in `portfolio.ts` — so the wrapping itself
  has no assertion anywhere.
- The `"Invalid operation: …"` wrapper (`portfolio.ts:154-163`, joining
  `parsePortfolioOperationInput`'s issues) is likewise never triggered in
  `portfolio.test.ts`. The underlying parse-failure *logic* is pinned in
  `app/lib/portfolio-operations.test.ts:42-58`, but the tool's own
  message-joining format is not.

**Triage question:** is the MCP tool's own message-formatting layer (as
opposed to the `app/lib` logic it wraps) worth a direct pin, the way
`GAP-017`–`GAP-020` are, or does pinning the underlying `app/lib` behavior
already cover what matters (the model gets *some* correctly-shaped error,
exact wording aside)? Lower priority than the other four either way.

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

### RJ-001 — `mcp/data-repo.ts` (was `mcp/data-gist.ts`)
**Rejected:** 2026-09-19 · **Reason:** covered in effect, no direct test
needed. *(Still holds after the storage cutover renamed it.)*

No `mcp/data-repo.test.ts` exists, but `resolveDataRepo`'s full contract is
pinned in `mcp/tools/portfolio.test.ts` (`describe('data repo resolution')`):
the token owner's own repo, a pinned repo served without the owner lookup,
concurrent caller dedup (one `GET /user` for two simultaneous calls), the
"does not exist yet" error and that no repo gets created, a token without the
`repo` scope refused with the 403 the transport maps to a challenge, and that a
failed lookup is not cached so a retry after signing in succeeds.
`mcp/http.test.ts` additionally pins per-token isolation for the header-pinned
branch and the reconnect challenge end to end. The "no direct coverage ≠ no
coverage" case the top of this file warns about.

### RJ-002 — `mcp/ainvestor-server.ts`
**Rejected:** 2026-09-19 · **Reason:** covered in effect, no direct test
needed.

`createAinvestorMcpServer` is called directly in `mcp/resources.test.ts:147`
and indirectly through every `mcp/http.test.ts` case via
`handleMcpHttpRequest`. Its one server-specific branch, `allowLocalFileTools`,
is pinned at `mcp/http.test.ts:246` ("lists every tool except the one that
reads a local file").

### RJ-003 — `mcp/jsonrpc.ts`
**Rejected:** 2026-09-19 · **Reason:** covered in effect, no direct test
needed.

`serializeJsonRpcMessage` and `JSON_RPC_ERROR_CODES` are imported and
asserted directly in `mcp/protocol.test.ts:1,4,336-344`. `isJsonRpcIncoming`'s
branches are pinned indirectly through `protocol.test.ts`'s malformed-envelope
and unusable-id cases, which exercise `handleMessage`'s envelope validation
that calls it. `successResponse`/`errorResponse` shape is asserted on
effectively every case in both `protocol.test.ts` and `http.test.ts`.

### RJ-004 — `mcp/server.ts`
**Rejected:** 2026-09-19 · **Reason:** deliberately untested by design, not
an oversight.

`docs/MCP_SERVER_PLAN.md:179-188` states `createMcpServer()` in `protocol.ts`
does no I/O so tests can drive the protocol directly, `server.ts` is the only
module that touches stdin/stdout, and tests must not import it. The design
keeps all testable logic in `protocol.ts` (tested) and leaves `server.ts` as
an intentionally-untested thin stdio-loop wrapper — the same shape as
`GAP-010`'s page-component/route split. Never re-propose this one; the
"blocked, needs a decision" treatment `GAP-010` gets doesn't apply here since
the decision is already made and documented.

---

## Done

### GAP-003 — guest session state
**Status:** `done` · **Proposed:** 2026-09-16 · **Acted:** 2026-09-16 · **Area:** `app/lib` · **PR:** https://github.com/pawelphilipczyk/ainvestor/pull/203

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

**Superseded:** guest mode was removed in Phase 0 of
`docs/STORAGE_MIGRATION_PLAN.md`, taking `app/lib/guest-session-state.ts` and
this test file with it. The sign-in gate that replaced it is covered by
`app/lib/require-approved-session.test.ts`.
