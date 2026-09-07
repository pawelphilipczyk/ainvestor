# MCP server plan

Plan for exposing this app's data to LLM clients over the **Model Context
Protocol**. Work proceeds in **small, separately-chatted stages**; each stage
ships one PR that passes `npm run check`, `npm run typecheck`, and `npm test`.

**Progress:** Stages 1, 2, 3, 4, 5 and 10 have shipped, plus the **guideline** and
**catalog** writes originally scheduled for Stage 7 — those came early because
setting targets and correcting the fund list from a client is what makes the
read tools worth having. Stage 7 keeps its box open for the holdings writes,
which move money-carrying rows and deserve their own review. Every catalog
write (`upsert_catalog_entry` and the bank import alike) runs its finished row
through one shared `validateCatalogEntry` — ticker/name required, ISIN format,
`risk_kid` 1–7 — so external bank data and a hand-typed MCP call are held to
the same check. `upsert_catalog_entry` merges directly onto the existing row
and splices it back in by id rather than going through
`mergeBankIntoCatalog`'s ISIN-keyed merge, which a partial update (the normal
case) would fail to match, silently duplicating the row under the same id. Flip
a checkbox to `[x]` when its stage ships (same PR as the code, or a tiny
follow-up).

Read before any implementation stage:

- `AGENTS.md` — working agreement, TypeScript style, function signature rule
- `docs/BIOME_RULES.md` — formatting and lint rules
- This file — decisions, data inventory, and stage prompts

MCP references:

- Specification: <https://modelcontextprotocol.io/>
- TypeScript SDK: <https://github.com/modelcontextprotocol/typescript-sdk>

---

## Decisions

These are settled so every thread starts from the same baseline. Change them
**here first** if you want a different shape, then adjust the affected stages.

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Transport | **Both**: stdio for a local client, `POST /mcp` on the deployed app for everything else | stdio needs the client to launch a local subprocess, so it cannot serve a phone at all. The HTTP endpoint (Stage 10) covers that without replacing stdio, and both share one tool definition in `mcp/ainvestor-server.ts`. |
| D2 | Auth | **The caller's own GitHub token with `gist` scope** — from env over stdio, from the `Authorization` header over HTTP. Remote clients obtain that token by signing in to **GitHub**, which the app names as its authorization server in published discovery metadata | The app never becomes an authorization server and stores no secret. Building one was designed and rejected once GitHub turned out to serve the same purpose: it supports PKCE `S256`, and the connector dialog's Client ID/secret fields take a GitHub OAuth App the user registers. |
| D3 | Write access | **Guideline and catalog writes are always exposed**, no env flag. Holdings writes still wait for Stage 7 | Superseded the original read-only-until-Stage-7 stance: setting targets and fixing the fund list from a client is the point of those tools, and an env flag only made them fail to appear. Guideline writes reach only the gist the caller's own token owns. Catalog writes reach shared, public data, so they carry their own guard instead: the catalog gist's **owner** is the only account GitHub lets write it, and the tools check that first so the refusal names both logins rather than surfacing a bare 404. Every write is a gist **revision**, so an overwritten edit is restorable. Holdings are a separate matter: `record_operation` mutates money-carrying rows, so it keeps its Stage 7 review. |
| D8 | Local-file tools | **stdio only**, the single sanctioned difference between the transports | `import_catalog_from_bank_file` reads a path on the caller's machine, which the deployed server cannot see, and a DevTools HAR runs to megabytes against the HTTP transport's 256 KB body cap. `createAinvestorMcpServer` takes `allowLocalFileTools` for exactly this; nothing else may vary between stdio and HTTP. |
| D4 | Location | **`mcp/` in this repo**, importing `app/lib/*` and `app/features/*` directly | Reuses `fetchEtfs`, `fetchGuidelines`, `fetchCatalog`, and the allocation maths with no package boundary. CI catches drift. |
| D5 | AI advice | **Read stored analyses only** in v1; generating new ones is optional Stage 9 | Generation needs `OPENAI_API_KEY` in the MCP client's environment and costs money per call. |
| D6 | Gist discovery | `AINVESTOR_GIST_ID` when set, otherwise discovery by description | Discovery works (pagination fixed in `app/lib/gist.ts`), but an explicit id avoids listing every gist on every start. |
| D7 | Protocol implementation | **Hand-rolled JSON-RPC over stdio, zero new dependencies** | `@modelcontextprotocol/sdk` pulls in ~90 packages (express, hono, zod, ajv) for what is newline-delimited JSON on stdin/stdout. This repo deliberately runs on three runtime dependencies. Cost: we own protocol correctness — see the note below. |

**Consequence of D7:** `mcp/protocol.ts` pins the revisions we answer
`initialize` with — currently **2025-11-25** and **2025-06-18**. The list stops
there deliberately: **2025-03-26 requires servers to accept JSON-RPC batches**,
and 2025-06-18 removed batching. Since this server implements no batching,
claiming the older revision would promise behaviour it does not have, so older
clients are answered with our latest and decide for themselves.

When a newer revision appears, add it only after checking that the `tools/list`
and `tools/call` shapes are unchanged **and** that it imposes no new mandatory
behaviour. Sources of record:

- `https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/<version>/schema.ts`
- `https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/specification/<version>/changelog.mdx`

### Environment variables

Named to match the existing `GH_` / `SHARED_CATALOG_GIST_ID` convention.

| Variable | Required | Description |
|---|---|---|
| `GH_TOKEN` | stdio only | GitHub PAT with the **`gist`** scope. Over HTTP the token arrives per request in the `Authorization` header instead, so the deployment never holds one. |
| `SHARED_CATALOG_GIST_ID` | stdio | Public gist holding `catalog.json`. Required since the catalog tools shipped: without it `fetchCatalog()` quietly returns an empty list, so a search would answer "no such fund" instead of "no catalog configured". |
| `AINVESTOR_GIST_ID` | No | Private data gist id. When unset, it is discovered by description from the caller's own token. Over HTTP a pinned id is served **only to an approved GitHub login** — see the note under Stage 10. |
| `AINVESTOR_PUBLIC_ORIGIN` | Off Fly | The origin advertised in OAuth discovery metadata. Required wherever `FLY_APP_NAME` is absent and the host is not loopback; request headers are never trusted for this. |
| `OPENAI_API_KEY` | No | Only needed if Stage 9 (advice generation) ships. |

---

## Data inventory

Everything is stored in GitHub gists — there is no database.

### One private gist per user

Found by **description** (`ai-investor-data`, or `ai-investor-preview-data` on
the preview app — see `getGistDescription()` in `app/lib/gist.ts`), **not** by
filename. It is a secret gist, so it does not appear on a public profile.

| File | Type | Read/write helpers |
|---|---|---|
| `etfs.json` | `EtfEntry` — `app/lib/gist.ts` | `fetchEtfs` / `saveEtfs` |
| `guidelines.json` | `EtfGuideline` — `app/lib/guidelines.ts` | `fetchGuidelines` / `saveGuidelines` |
| `advice-buy-next.json` | `StoredAdviceAnalysis` — `app/features/advice/advice-gist.ts` | `fetchStoredAdviceAnalysisForTab` |
| `advice-portfolio-review.json` | same | same |
| `advice-analysis.json`, `portfolio-review.json` | legacy | read-only fallbacks |

### One shared public gist

`catalog.json`, id from `SHARED_CATALOG_GIST_ID`. Read with `fetchCatalog()` —
no token required, cached in-process for 60s, cleared on every successful
`saveCatalog()` so a write is never served stale for the rest of the TTL.
`CatalogEntry` carries `ticker`,
`name`, `type`, `description`, and optionally `isin`, `expense_ratio`,
`risk_kid` (1–7), `region`, `sector`, `rate_of_return`, `volatility`,
`return_risk`, `fund_size`, `esg`.

Only the gist **owner** may write it (`isSharedCatalogAdmin()`), which is what
makes the MCP catalog writes safe to expose: a non-owner is refused before the
call reaches GitHub, and GitHub would refuse it anyway.

### Derived logic worth exposing as tools

This is the part that makes the server more than a JSON reader:

| Function | Module | What it gives |
|---|---|---|
| `computeAdviceAllocationDiagnostics()` | `app/features/advice/advice-openai.ts` | Buy-only allocation gaps **in currency terms** per asset-class bucket |
| `aggregateGuidelineTargetsByEtfType()` | same | Instrument + asset-class targets folded into one bucket per type |
| `totalHoldingsValueForShareBars()` / `valueShareOfHoldingsTotalPercent()` | `app/lib/portfolio-holdings-share.ts` | Per-holding share of the portfolio |
| `sumGuidelineTargetPercent()` / `wouldGuidelineTotalExceedCap()` | `app/lib/guidelines.ts` | Target totals and the 100% cap |
| `riskBandFromRiskKid()` / `findCatalogEntryByTicker()` | `app/features/catalog/lib.ts` | Risk banding and ticker lookup |

---

## Known gaps in the data model

These bound what any MCP tool can answer. Do **not** invent workarounds inside
the MCP layer; if one of these matters, fix the model in the app first.

- **No time dimension.** No record carries a date. Buy and sell mutate `value`
  in place, so there is no transaction history. Questions like "how did my
  portfolio do this year" are unanswerable.
- **No quantity or price.** `quantity` was deliberately dropped
  (`app/lib/gist.ts`); only a monetary `value` is stored. Market revaluation
  and rate of return are out of reach.
- **No FX.** With mixed currencies `totalHoldingsValueForShareBars()` and
  `computeAdviceAllocationDiagnostics()` both return `null`. Tools must say so
  plainly rather than guessing a rate.
- **The catalog is a snapshot**, imported from a bank API — not live quotes.
- **`mixed` is both an asset class and a sentinel.** It is one of the six
  persisted `EtfType` values, and it is also what
  `resolveHoldingEtfTypeForAdviceDiagnostics` falls back to when neither the
  catalog nor an instrument guideline matches a holding. The allocation maths
  then refuses *any* holding resolving to `mixed`, so a fund the catalog
  genuinely classifies as mixed cannot be allocated against even with a `mixed`
  guideline set — and from outside the resolver the two cases are
  indistinguishable, which is why `get_buy_plan` names both
  possibilities rather than asserting either. Separating the sentinel from the
  class is an app-model fix, not an MCP one.

---

## Layout and conventions

```
mcp/
  ainvestor-server.ts  # the tool and resource surface, shared by both transports
  server.ts            # stdio entry point: stdin lines in, JSON-RPC out
  http.ts              # Streamable HTTP transport, mounted at POST /mcp
  oauth-metadata.ts    # RFC 9728 / RFC 8414 discovery pointing at GitHub
  protocol.ts          # MCP dispatch (initialize, ping, tools/*, resources/*)
  jsonrpc.ts           # JSON-RPC 2.0 types, error codes, single-line framing
  config.ts            # env resolution and validation
  data-gist.ts         # resolves the data gist id (never creates one)
  resources.ts         # ainvestor://portfolio, ://guidelines, ://catalog
  stdout-guard.ts      # keeps console output off the stdio protocol channel
  tools/portfolio.ts   # get_portfolio
  tools/guidelines.ts  # get_guidelines, set_guideline, delete_guideline
  tools/buy-plan.ts    # get_buy_plan
  tools/saved-advice.ts   # get_saved_advice, and the stored document as text
  tools/catalog.ts     # list_catalog, get_catalog_entry, and the owner-only row writes
  tools/catalog-import.ts # import_catalog_from_bank_file (stdio only, reads a local path)
  tools/rounding.ts    # the two-decimal rounding both tool modules report in
  tools/tool-result.ts    # jsonResult — the one-JSON-text-block response shape
  tools/tool-arguments.ts # readStringArgument — trim-or-null argument parsing
  **/*.test.ts         # co-located, run by `tsx --test`
```

`createMcpServer()` in `protocol.ts` does no I/O — it maps a parsed message to a
response — so tests drive the protocol directly without spawning a process.
`server.ts` is the only module that touches stdin/stdout.

Rules specific to this subtree:

- **Never write to stdout.** On stdio transport, stdout *is* the protocol
  channel. Use `console.error` (stderr) for diagnostics. Never import
  `server.ts` from the repo root — it starts an HTTP listener and logs to
  stdout.
- **Do not duplicate app logic.** Import it. If a helper is not exported, export
  it from its existing module rather than copying it.
- Follow `AGENTS.md`: full words in names, one object parameter past two
  arguments, `import type` for types, tabs, single quotes, no semicolons.
- Tool descriptions and outputs are **English only** — they are not UI copy and
  do not belong in `app/locales/*`.

---

## Tool surface

Read-only (Stages 2–5):

| Tool | Returns |
|---|---|
| `get_portfolio` | Holdings, total value, per-holding share %, currency warnings |
| `get_guidelines` | Target rows, their sum, aggregated buckets per asset type |
| `list_catalog` | Catalog rows matching a free-text query, compact projection, with `matched`/`truncated` so a limited list never reads as the whole catalog |
| `get_catalog_entry` | One entry by ticker or id, all fields |
| `get_buy_plan` | Buy-only gaps per bucket for a given cash amount, the cash split across them, or a named reason there are no numbers |
| `get_saved_advice` | The stored analysis for `buy_next` or `portfolio_review`, flattened to text, or a named reason there is none |

Resources: `ainvestor://portfolio`, `ainvestor://guidelines`,
`ainvestor://catalog`, each carrying exactly what its tool returns. The
`resources` capability is advertised only when a server actually has resources,
so `createMcpServer` stays usable without them — a client that sees the
capability will call `resources/list`, and claiming it while answering
`methodNotFound` is a broken handshake. Unlike a tool failure, which travels
inside the result as `isError`, a failed `resources/read` is a JSON-RPC error:
`contents` carries no error flag, so the alternative is handing the client an
explanation dressed as the data it asked for. `mcp/http.ts` therefore recognises
a rejected credential on that shape too, or an expired token would surface as a
plain `500` from a resource read and never prompt a refresh.

`ainvestor://catalog` returns **every** row, where `list_catalog` stops at its
limit: a model running a search does not know how much it is about to pull in,
but a client reading the dataset by URI has asked for all of it, and truncating
there answers a different question. The compact projection keeps it bounded.

An **empty** catalog carries a note in both the resource and `list_catalog`,
because `fetchCatalog()` reports an unconfigured gist id, a rejected read and a
timeout all as no rows — the same ambiguity `get_buy_plan` already names in its
`unclassified_holding` reason. Without it, a GitHub outage reads as "this app
knows no funds", which against the "never propose a fund the catalog does not
list" instruction means telling the user there is nothing to buy.

Write: `set_guideline`, `delete_guideline`, `upsert_catalog_entry`,
`delete_catalog_entry` and `import_catalog_from_bank_file` (shipped, always
exposed; the catalog three owner-only, the import stdio-only per D8);
`record_operation` and `remove_holding` still to come in Stage 7.

`set_guideline` is an upsert, not an append: there is one row per asset class
and one per ticker, so setting an existing one updates its target. The 100% cap
is checked against the rows that will remain, so raising an existing target does
not count its old value twice. Instrument rows resolve their ticker and asset
class through the shared catalog when `SHARED_CATALOG_GIST_ID` is set; with an
unlisted ticker the caller must name `etfType` and the response says the class
was not verified — the web app's form simply refuses that case, but over MCP the
catalog may not be configured at all.

`upsert_catalog_entry` finds the row by ticker and merges the call's fields
directly onto it (`{ ...existing, ...changes }`), then splices the result back
into the array **by id** — it does not hand the row to `mergeBankIntoCatalog`.
That function's merge key includes `isin` when the row has one, so a partial
update that omits `isin` (the normal case, since a caller only names the
fields it is changing) would not match its own existing row and would append
a duplicate under the same id instead of updating it. `import_catalog_from_bank_file`
still uses `mergeBankIntoCatalog` correctly, because every row it submits
carries the bank's own `isin` field fresh, so its key always agrees with what
is already stored.

### Keeping the three "what should I buy" tools apart

`get_buy_plan` (Stage 4) and `get_saved_advice` (Stage 5) have shipped;
`generate_advice` (Stage 9) is still to come. All three answer some version of
"what should I do with my money", so a client asking one plain question could
reach for any of them. That is a naming and description problem, and it is
cheaper to settle here than to debug later:

| Tool | Gives | Costs | Picks funds? |
|---|---|---|---|
| `get_buy_plan` | Numbers: gap to target per class, minimum buy, cash split | Two gist reads | No |
| `get_saved_advice` | The last written analysis, as stored | One gist read | Already picked, possibly stale |
| `generate_advice` | A fresh written analysis from OpenAI | **Money, per call** | Yes |

Rules for whoever implements Stages 5 and 9:

- **`get_buy_plan` is the default** for "where do I put this cash". Its name
  says what it returns, and its description says outright that it gives numbers
  and no fund picks, so a model that needs tickers knows to go to
  `list_catalog` rather than reach for a paid tool.
- **`generate_advice` must announce its cost in its own description** and say it
  is for when the user explicitly asks for a written analysis — not for a
  routine "what should I buy". D5 already requires the cost note; this is the
  same requirement seen from the tool-selection side.
- **Do not put "advice" in the name of anything that is not the LLM's prose.**
  This is why Stage 4 shipped as `get_buy_plan` rather than the
  `get_investment_advice` that was briefly considered: the app already binds
  "investment advice" to `getInvestmentAdvice()`, its OpenAI path, and the UI
  string `advice.result.title`. Three tools with "advice" in the name is exactly
  how a client picks the wrong one.
- `generate_advice` recomputes the same figures internally, so a client that
  calls `get_buy_plan` first and then `generate_advice` is doing redundant but
  harmless work. Not worth guarding against; worth knowing.

`get_buy_plan` answers with a **discriminated union**, not a
partially-filled object: when it cannot compute, there is no `buckets` array at
all, so a caller cannot read zeroes out of one and present them as real gaps. It
carries a machine-readable `blocker` alongside the prose `reason` for the same
purpose. Its `deployCash` per bucket is the actionable number — the minimum buys
alone do not add up to the cash whenever a bucket is overweight.

Both catalog write paths run their finished row through `validateCatalogEntry`
(`app/features/catalog/lib.ts`) before saving: ticker and name non-empty,
`isin` (if set) matches the ISIN format via the same `normalizeIsinForCatalogId`
the id derivation uses, and `risk_kid` (if set) is a whole number 1–7 via
`isValidRiskKid`. Bank JSON is external input too, so `parseBankJsonForImport`
now runs the row it built through the identical check (gaining a
`riskKidOutOfRange` diagnostic it did not have before) rather than validating
only the raw pre-import fields the way it used to.

Never exposed: OAuth, session state, and any tool that rewrites the whole
portfolio or catalog at once.

Tools currently return a JSON document inside a single text content block. MCP
also allows `structuredContent` with an `outputSchema` (revision 2025-06-18 and
later). Worth adopting once more than one tool exists, but it duplicates the
payload, so it is not free.

---

## Cost bar for MCP tools

`get_buy_plan` and `get_saved_advice` shipped with a "map every failure to a
distinct, named reason" pattern and full per-branch test coverage. That is
real value — it is what let review catch the `readMode` type-confusion bug
and the malformed-file conflation bug before merge — but the same discipline
was also spent re-verifying identical business logic at the tool layer, the
resource layer and the HTTP layer, and restating the same design decision in
both a doc paragraph and a code comment. Neither buys additional confidence;
both are just cost. This section says what stays and what to stop paying for,
so it holds for every stage after this one.

Keep, always:

- **Never collapse two blockers/reasons into one if a client would need to
  act differently on them.** `get_buy_plan`'s six blockers, `get_saved_advice`'s
  `not_found`/`malformed`/`unreadable` split, and `malformed`'s `mode`/`legacy`
  split all stay exactly as they are — each exists because collapsing it
  produced a wrong answer, not because it looked thorough.
- **The discriminated-union outer shape** (`available: true`/`false` and
  equivalents) is not up for relaxation, nor is any other discriminated
  union's shape or blocker set.
- **Any test that exists because review found a real bug** in this PR or an
  earlier one stays, unconditionally.
- **Input validation** (argument types, ranges, enums) stays exhaustive; it is
  the boundary where a model's mistake must turn into a clear error rather
  than a wrong answer.
- **Coverage of a distinct code path stays, wherever it lives.** What is
  protected is the coverage, not the file it happens to be in — `tools/*.test.ts`
  is not exempt from the next rule just by being the tool's own test file.

Relax, from here on:

- **Business logic gets its exhaustive test coverage in exactly one place:**
  the tool's own `tools/*.test.ts`. `resources.test.ts` and `http.test.ts`
  assert transport/wiring only — status codes, auth, that the right tool or
  resource ran — against one or two representative payloads. They do not
  re-derive every blocker case the tool test already covers.
- **One test per code path, not one per cosmetic variant — including inside
  `tools/*.test.ts` itself.** If a single input already exercises several
  branches together (a document with all four block types, say), that is one
  test, not four. If two tests in the tool's own file end up exercising the
  same branch with cosmetically different numbers, that is the same
  redundancy this bar exists to cut, not something the file's status as
  "source of truth" excuses.
- **A code comment states a non-obvious invariant that has no doc home.** It
  does not restate a design decision this file already records for that
  stage. When both exist, delete the comment, not the doc paragraph — this
  doc is the place a future stage reads before touching the code, and a stale
  comment left behind after an edit is worse than no comment.

When in doubt about whether a path is "the same business logic" or "a new
branch a client would act on differently," the test question is: would two
different callers need to do two different things in response? If yes, it is
a distinct reason and keeps its own test and its own message. If no, it is a
cosmetic variant of a path already covered, and one test is enough.

---

## Separate-chat implementation prompts

Run these one at a time in separate chats. Each prompt is self-contained and
the plan is already agreed, so implement directly rather than re-planning.

- [x] **Stage 1 — Scaffold, config, and a smoke tool** — shipped. Hand-rolled per D7 instead of adding the SDK; `get_server_info` was dropped in favour of shipping the real `get_portfolio` tool alongside.

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. The plan is agreed — implement directly, no separate planning message.

  Goal: a runnable stdio MCP server skeleton with no domain tools yet.

  Do:
  - Implement JSON-RPC over stdio directly, with no new dependencies (see decision D7).
  - Add "mcp/**/*.ts" to the tsconfig.json include array. Without this npm run typecheck silently skips the whole new subtree.
  - Create mcp/config.ts: resolve and validate GH_TOKEN, SHARED_CATALOG_GIST_ID, optional AINVESTOR_GIST_ID. Throw a clear, actionable error naming the missing variable.
  - Create mcp/server.ts: an stdio MCP server exposing one trivial tool (for example get_server_info returning the resolved config with the token redacted) so a client can verify the connection.
  - Add an "mcp" npm script that runs it with tsx.
  - Add mcp to .dockerignore — the Fly image does not need it.

  Constraints:
  - Never write to stdout; stdout is the protocol channel. Diagnostics go to console.error.
  - Do not import the repo-root server.ts.
  - No changes under app/.

  Test: mcp/config.test.ts covering missing required vars, the optional gist id, and the write flag default being off.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one scaffolding PR, plus a README section showing the MCP client config (command, args, env).
  ```

- [x] **Stage 2 — Guidelines read tool** — shipped, together with the guideline write tools pulled forward from Stage 7.

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 1. The plan is agreed — implement directly.

  Goal: get_guidelines, matching the shape of the existing get_portfolio tool in mcp/tools/portfolio.ts.

  Do:
  - Read rows with fetchGuidelines from app/lib/guidelines.ts, using resolveDataGistId from mcp/data-gist.ts for the gist id.
  - Add sumGuidelineTargetPercent so the model sees whether targets add up to 100.
  - Add aggregateGuidelineTargetsByEtfType from app/features/advice/advice-openai.ts so it sees the effective bucket per asset type, not just raw rows. Instrument rows count toward their asset class — that is the single most misread part of this model.
  - Register it in mcp/ainvestor-server.ts next to get_portfolio, which is where both transports get their tool list. Registering it in mcp/server.ts would expose it over stdio only.

  Constraints:
  - Import the existing helpers; do not reimplement the maths.
  - Follow the summarize/create split used by mcp/tools/portfolio.ts so the pure summary function stays testable without network.

  Test: mock globalThis.fetch as mcp/tools/portfolio.test.ts does. Cover no guidelines, instrument plus asset-class rows of the same type folding into one bucket, and targets summing over 100.

  Verify: npm run check, npm run typecheck, npm test, plus a real handshake over both transports — an stdio probe (see the Stage 1 probe in the git history) and a tools/list against a running server on POST /mcp.

  Deliverable: one PR.
  ```

- [x] **Stage 3 — Catalog read tools** — shipped, reshaped: the filters below were cut to a single free-text query (the tool exists to ground tickers, not to browse), and the owner-only writes were added in the same PR, in three commits: the tools themselves, a fix for a duplicate-row bug in `upsert_catalog_entry` found in review (see the write-tools section above), and `validateCatalogEntry` shared with the bank import. The prompt is kept as written for the record.

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 2. The plan is agreed — implement directly.

  Goal: list_catalog and get_catalog_entry.

  Do:
  - Make SHARED_CATALOG_GIST_ID required in mcp/config.ts as part of this stage — it becomes load-bearing here, and until now the server deliberately started without it.
  - list_catalog: fetchCatalog from app/features/catalog/lib.ts, with optional filters for etf type, region, sector, risk band (reuse riskBandFromRiskKid), esg, and a free-text query over ticker and name. Support a limit with a sane default.
  - get_catalog_entry: look up by ticker (reuse findCatalogEntryByTicker, which normalises case and spacing) or by id, returning every field.

  Constraints:
  - The catalog can hold hundreds of rows. list_catalog must return a compact projection by default (ticker, name, type, expense_ratio, risk_kid) and only the full row from get_catalog_entry, so a broad listing cannot blow the context window.
  - Do not expose saveCatalog or the bank-JSON import.

  Test: use setSharedCatalogForTests / resetSharedCatalogForTests from app/features/catalog/lib.ts so no network is needed. Cover each filter, the limit, and an unknown ticker.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one PR.
  ```

- [x] **Stage 4 — Allocation diagnostics tool** — shipped as **`get_buy_plan`**,
  not under the stage's own working title.

  The rename came from using it: "diagnostics" is jargon that says nothing about
  what the caller gets back, and the first instinct on reading it was to call it
  `get_investment_advice` instead. That is worse — see the disambiguation table
  above. `get_buy_plan` says what it returns, carries the buy-only constraint in
  the name itself, and leaves "advice" free for the tool that will actually
  produce it. The app-side functions keep their `AllocationDiagnostics` names:
  there they describe the prompt block that really is labelled "Server
  allocation diagnostics", so the two vocabularies are correct in their own
  places.

  The stage's "map each null to a distinct message" requirement drove the shape
  of the change. `computeAdviceAllocationDiagnostics` collapsed six different
  causes into one `null`, and re-deriving them in `mcp/` would have duplicated
  app logic the plan forbids duplicating. So the guards were lifted into
  `computeAdviceAllocationDiagnosticsOutcome`, which returns the diagnostics
  **or** a named `blocker` — `unparseable_cash`, `mixed_holding_currencies`,
  `cash_currency_mismatch`, `no_guidelines`, `no_positive_targets`,
  `unclassified_holding`, the last two of which the stage prompt had not
  anticipated. The old function now delegates to it and still returns `null`, so
  the advice path is untouched.

  The per-bucket cash split had the same problem: it existed only as prose
  inside `formatAdviceAllocationDiagnosticsBlock`. It is now
  `planAdviceCashDeployment`, which both the prompt block and the tool call.
  Extracting it made an invariant visible: because targets scale to the
  post-investment total, the minimum buys sum to **exactly** the cash unless a
  bucket is overweight — and an overweight bucket is clamped to a zero minimum,
  which pushes the sum above the cash instead. The "remaining cash" branch is
  therefore unreachable (a 20k-case fuzz found a maximum remainder of 2e-12), so
  the tool reports that field only when it is non-zero rather than always
  emitting a 0.

  Two deviations from the prompt, both deliberate:

  - **An unparseable `cashAmount` throws** rather than returning a blocked
    payload. It is a fault in the call, not in the data, and the caller can fix
    it immediately; state-shaped problems (mixed currencies, no guidelines) get
    the structured `available: false` answer instead.
  - **`cashCurrency` is optional**, defaulting to the currency the holdings
    already share and falling back to the app's own default only for an empty
    portfolio. Requiring it would have made `cash_currency_mismatch` the routine
    answer for anyone not holding PLN. The response reports which source was
    used in `cash.currencySource`.

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 3. The plan is agreed — implement directly.

  Goal: get_allocation_diagnostics — the most valuable tool in the set.

  Do:
  - Take cashAmount and cashCurrency as input; parse the amount with parseAdviceCashAmount so locale decimal separators behave like the UI.
  - Call computeAdviceAllocationDiagnostics from app/features/advice/advice-openai.ts with the live holdings, guidelines, and catalog.
  - Return the per-bucket rows (target %, current amount, target amount after deployment, minimum ideal buy) plus the post-investment total.

  Constraints:
  - The function returns null for unparseable cash, mixed currencies, or no guidelines. Map each case to a distinct, explicit message so the model reports the real reason instead of inventing numbers.
  - This is buy-only by design: never present it as advice to sell.

  Test: cover a clean single-currency portfolio with guidelines, the mixed-currency null, the no-guidelines null, and a bad cash string.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one PR.
  ```

- [x] **Stage 5 — Stored advice tool and MCP resources** — shipped.

  Three deviations from the prompt, all for the same reason: a stored analysis
  that cannot be read must say *which* of the three ways it could not be read,
  or a client regenerates an analysis that is sitting right there.

  - **The read reports its outcome.** `fetchStoredAdviceAnalysisForTab` returned
    one `null` for "never written", "stored in a shape this version cannot
    parse", and "GitHub refused the gist". That collapse is fine for the advice
    page, which only ever renders a snapshot or nothing, but it is not an answer
    for a client. As with Stage 4's blockers, the distinction was lifted into the
    app rather than re-derived in `mcp/`:
    `fetchStoredAdviceAnalysisOutcomeForTab` returns `found`, `not_found`,
    `malformed` or `unreadable` with the HTTP status, and the old function now
    delegates to it and still answers snapshot-or-null, so the page is untouched.
    A file that parses but belongs to the *other* tab is `not_found`, not
    `malformed` — for the tab asked about there is simply nothing. `malformed`
    also carries **which** file failed to parse: the legacy
    `advice-analysis.json` holds whichever mode was saved last, so a corrupt one
    is no evidence that the mode asked about was ever generated, and the answer
    says so instead of asserting an analysis exists.
  - **`unreadable` throws** rather than returning a blocked payload, matching
    `fetchGuidelinesOrThrow`'s message shape (`…: 401`). That is what makes the
    HTTP transport answer a stale token with a `401` challenge instead of a
    cheerful "no advice saved", which is what teaches a client to refresh.
  - **A mode the caller names and gets wrong is refused.**
    `normalizeAdviceAnalysisTab` maps anything unknown onto `buy_next`, which is
    right for a URL parameter and wrong here: answering a request for
    `portfolio-review` with the buy-next analysis is a silently wrong answer.
    It is still used for the *omitted* argument, where the default is the point.

  The stored `AdviceDocument` is flattened to text
  (`flattenAdviceDocumentToText`): the block structure is a rendering vehicle for
  the advice page's JSX, and handed over raw it costs a model more attention to
  decode than the sentences inside it are worth. Every block type gets the lines
  a reader would have seen, including `capital_snapshot` and `guideline_bars`,
  which the prompt did not mention.

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 4. The plan is agreed — implement directly.

  Goal: read stored analyses, and expose the three datasets as MCP resources.

  Do:
  - get_saved_advice with a mode argument (buy_next or portfolio_review); normalise it with normalizeAdviceAnalysisTab and read via fetchStoredAdviceAnalysisForTab from app/features/advice/advice-gist.ts. Keep the legacy-file fallback that already exists there.
  - Register resources ainvestor://portfolio, ainvestor://guidelines, and ainvestor://catalog returning the same JSON as the matching tools.
  - Flatten the stored AdviceDocument blocks into readable text; do not dump raw block structures at the model.

  Test: cover a missing stored analysis, a valid one, and a malformed one.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one PR.
  ```

- [ ] **Stage 6 — Caching and rate-limit hardening** — the write-invalidation half of its third `Do` bullet has already shipped (#171, ahead of the stage): `saveCatalog()` clears the shared catalog's TTL cache on every successful write, so `upsert_catalog_entry`/`delete_catalog_entry`/the bank importer and the web UI's own catalog reads cannot serve a stale snapshot for up to 60s after a save. What is left is the rest of the stage: a TTL cache for private gist reads.

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 5. The plan is agreed — implement directly.

  Goal: stop a single model turn from hammering the GitHub API.

  Context: the shared catalog already has a 60s in-process TTL cache, invalidated on every write (#171). Private gist reads (portfolio, guidelines) have no cache at all. A model can call five tools in one turn, each triggering its own gist GET.

  Worth knowing before starting: holdings and guidelines live in the *same* gist, but `fetchEtfs` and `readGuidelinesGist` each GET it separately and parse their own file out of the response. So any caller wanting both makes two identical authenticated requests for one payload. `get_buy_plan` does (in parallel), and so does the web advice page in `app/features/advice/index.ts` (sequentially). A TTL cache keyed by gist id collapses both to one read, which is the cheapest fix and is why neither call site was rewritten to hand-parse the shared payload.

  Do:
  - Add a short in-process TTL cache for private gist reads, following the shape of the shared catalog cache in app/features/catalog/lib.ts (TTL constant, env override, test reset helper).
  - Expose a reset helper for tests.
  - Invalidate the cache on every successful write (set_guideline, delete_guideline already exist; follow #171's pattern).

  Constraints:
  - Cache inside mcp/ only. Do not change caching behaviour for the web app.

  Test: assert a second read inside the TTL issues no second fetch, and that an expired entry refetches.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one PR.
  ```

- [ ] **Stage 7 — Write tools (opt-in)** — the guideline and catalog halves have shipped; what remains is `record_operation` and `remove_holding`.

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 6. The plan is agreed — implement directly.

  Goal: record_operation, remove_holding, set_guideline, delete_guideline.

  Do:
  - Decide per tool whether it ships unconditionally, as the guideline writes did. record_operation and remove_holding move money-carrying rows, so weigh that before exposing them the same way.
  - Reuse the existing validation: normalizePortfolioOperationInput from app/features/portfolio/portfolio-operation-form/index.ts for buy and sell, and findGuidelineDuplicateOf plus wouldGuidelineTotalExceedCap from app/lib/guidelines.ts for guideline rows.
  - Every write is read-modify-write inside a single tool call: fetch current rows, apply the change, save the full array back. Read with a helper that throws on a rejected GitHub read (as fetchGuidelinesOrThrow does), never one that reports an outage as an empty list — otherwise a save wipes the file.
  - Return the resulting state so the model can confirm what landed.

  Constraints:
  - saveEtfs and saveGuidelines replace the whole gist file. There is no optimistic locking, so a write racing an open browser tab can lose an edit. Keep the read and the write adjacent, and document the risk in the tool description.
  - Never expose a tool that clears or rewrites the whole portfolio at once.

  Test: cover a buy against an existing ticker, a buy creating a new row, a sell, a removal, a duplicate guideline rejection, and a guideline exceeding the 100% cap.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one PR.
  ```

- [ ] **Stage 8 — Documentation**

  ```text
  Read AGENTS.md and docs/MCP_SERVER_PLAN.md. Continue after Stage 7. The plan is agreed — implement directly.

  Goal: make the server usable by someone who has not read this plan.

  Do:
  - Add an MCP section to README.md: what it exposes, the environment variables, how to create the PAT with the gist scope, and a client config example.
  - Document how to find the private data gist (secret gist, matched by description, not filename).
  - Update this plan's checkboxes and progress line.
  - State the known gaps (no time dimension, no quantity or price, no FX) so users do not expect returns or performance answers.

  Verify: npm run check if any code or config changed.

  Deliverable: one docs PR.
  ```

- [ ] **Stage 9 — Advice generation (optional)**

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Optional stage — only do this if the decision D5 in the plan has been changed to allow generation.

  Goal: generate_advice, calling the same OpenAI path the web app uses.

  Do:
  - Reuse getInvestmentAdvice from app/features/advice/advice-openai.ts and createAdviceClient from advice-client.ts.
  - Leave the model argument optional: omitting it uses DEFAULT_ADVICE_MODEL (gpt-5.6-sol, the flagship
    reasoning tier), which is the same default the web app's advice page uses. Accept only ids from
    ADVICE_MODEL_IDS so a caller can drop to a cheaper tier but not name an arbitrary model.
  - Require OPENAI_API_KEY; fail with a clear message when it is absent.
  - Make saving the result to the gist an explicit opt-in argument, defaulting to off.

  Constraints:
  - Each call costs money. Say so in the tool description.
  - Do not fork or reword the system prompts; import them.

  Test: inject a mock client with setAdviceClient, as app/features/advice/advice.test.ts does. Never hit the real API in tests.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one PR.
  ```

- [x] **Stage 10 — Remote HTTP transport** — shipped.

  `POST /mcp` on the app itself, so the tools are reachable from any MCP client
  including the mobile app. `mcp/http.ts` holds the transport; `app/router.ts`
  mounts it.

  **Credentials travel per request.** `Authorization: Bearer <GitHub token with
  the gist scope>` — the same credential the stdio configuration holds in a local
  file, moved into a request header. Consequences worth keeping in mind:

  - The server stores **no secret**. Nothing is readable without a token that
    already grants that access directly against GitHub.
  - It is **multi-user for free**: each caller reads their own gist. The gist-id
    caches in `mcp/data-gist.ts` are therefore keyed **by token** — a
    process-wide cache would hand one caller another's holdings. The keying
    itself lives in `mcp/token-cache.ts`: SHA-256 keys so a heap dump yields
    no usable credential, and LRU eviction so a hot entry survives.
  - No authorization server, no `/authorize`, no `/token`, no PKCE, no client
    registration, no token storage. An earlier draft of this stage proposed an
    OAuth bridge for all of that; passing the user's own token removes the need.

  Optional `X-Ainvestor-Gist-Id` pins the gist per request. It needs no
  allowlist, because it can only reach what the caller's own token already
  reaches; the id is validated as `[A-Za-z0-9]{1,64}` so it cannot steer the
  server's authenticated call at a different GitHub path.

  `AINVESTOR_GIST_ID` on the deployment is different in kind: it names one
  specific gist, and a secret gist is unlisted rather than access-controlled,
  so holding its id is enough to read it. It is therefore served only to a
  caller whose GitHub login is on the app's own allowlist
  (`mcp/approved-caller.ts`, resolving the login from the presented token);
  anyone else gets **403** and the gist is never fetched on their behalf. That
  also restores on `/mcp` the invariant `stripGithubTokenIfUnapproved` enforces
  on every session-backed route.

  Transport details, all verified against a running server: `GET` returns **405**
  (no SSE stream is offered, which the spec allows), a notification returns
  **202** with an empty body, a request returns **200** with a single
  `application/json` object, a mismatched `Origin` returns **403** (the spec
  requires this against DNS rebinding), and an `MCP-Protocol-Version` this server
  does not implement returns **400**.

  ### Sign-in: GitHub is the authorization server

  The Claude mobile connector dialog offers only a URL and OAuth Client
  ID/secret — **no request-header field** — so a pasted Bearer token cannot be
  configured there. Rather than becoming an authorization server, the app
  publishes discovery metadata (`mcp/oauth-metadata.ts`) that points at GitHub:

  - `/.well-known/oauth-protected-resource` (RFC 9728) names the app's own origin
    in `authorization_servers` and `gist` in `scopes_supported`.
  - `/.well-known/oauth-authorization-server` (RFC 8414) carries `issuer` = the
    app, and `authorization_endpoint` / `token_endpoint` = GitHub's.
  - A `401` from `/mcp` carries
    `WWW-Authenticate: Bearer resource_metadata="…", scope="gist"`.

  **Why the app is the issuer:** clients discover authorization-server metadata
  at `<issuer>/.well-known/oauth-authorization-server`, and GitHub publishes no
  such document, so naming `github.com` there would simply fail discovery.

  No `registration_endpoint` is advertised, so the client uses a GitHub OAuth App
  the user registers themselves — which is exactly what the dialog's Client ID
  and secret fields are for. GitHub has supported PKCE `S256` since July 2025,
  which is what made this possible.

  **The origin is not taken from request headers.** It becomes the issuer and
  the `resource_metadata` target, so a caller who could choose it could send
  clients to an authorization server of their own and harvest GitHub tokens.
  Resolution is `AINVESTOR_PUBLIC_ORIGIN`, then `https://$FLY_APP_NAME.fly.dev`
  (Fly sets that in the machine's environment, and no request can forge it),
  then a loopback host for local runs — and otherwise nothing, in which case
  discovery answers **500** rather than guess. Trusting `request.url` instead
  would advertise `http://` behind Fly's TLS termination and break the flow.

  The metadata is `Cache-Control: no-store`: it names this deployment's origin,
  and a shared cache replaying one deployment's answer to another's clients
  would redirect their sign-in.

  ### Verified end to end

  Confirmed working from the **Claude mobile app** against the preview
  deployment: discovery, GitHub sign-in with PKCE, token exchange, `initialize`
  and `tools/list` all succeed, and `get_portfolio` appears in the client.

  Two things this settled that could not be checked from CI:

  1. **Redirect URI** — `https://claude.ai/api/mcp/auth_callback`, registered
     under the OAuth App's **Authorization callback URL**. Homepage URL is
     cosmetic and is a common wrong turn. When another client differs, the
     failed authorization's own page URL carries the `redirect_uri` it sent.
  2. **Token response format** — no problem in practice. The worry was that
     GitHub's token endpoint returns form-encoded data unless the caller sends
     `Accept: application/json`; the client evidently sends it.

  Registration settings that matter: **Allow wildcard matching** off (strict
  redirect matching is the defence against code interception), **Enable Device
  Flow** off (unused). **Expire user access tokens** may be left on now that
  `refresh_token` is advertised — it was worth turning off only to isolate
  variables during the first attempt.

  ### Security note

  A classic PAT or OAuth token with the `gist` scope is all-or-nothing across
  every gist on the account; fine-grained tokens do not support gists. The token
  is also not audience-bound to this server, a deviation from the MCP security
  guidance that the read-only tool surface mitigates but does not remove.

  A review pass after the endpoint worked end to end closed these, each with a
  test that fails without the fix:

  - `AINVESTOR_GIST_ID` served the deployment owner's gist to any caller holding
    any GitHub token — now gated on the allowlist, as described above.
  - The advertised origin came from forgeable headers — now environment-derived.
  - The metadata was publicly cacheable although it is host-dependent — now
    `no-store`.
  - `X-Ainvestor-Gist-Id: ../user/repos` collapsed during URL parsing and pointed
    the server's authenticated GitHub call at another endpoint — now validated.
  - An expired token surfaced as a tool error rather than a transport `401`, so a
    client never learned to refresh and the connector stayed dead.
  - A non-array gist listing was read as "no match", which let sign-in create a
    duplicate data gist — now an error.
  - `id: null` was treated as a notification, so a client that sent one waited
    forever for a response that would never come.
  - The JSON body was unbounded, and the token caches held plaintext tokens and
    evicted arbitrarily — now capped, hashed, and LRU.

## Open questions

- ~~Does the connector dialog let you set a request header?~~ **Answered: no.**
  It offers a URL and OAuth Client ID/secret only, which is why the discovery
  metadata above exists. The `Authorization` header path still serves stdio and
  anything scriptable.
- Should the MCP server ever see the preview gist (`ai-investor-preview-data`),
  or is production data the only target? Currently the description depends on
  `FLY_APP_NAME`, which is unset locally, so it resolves to production.
- Is there appetite for adding a **time dimension** (dated transactions) to the
  app? Without it, several natural questions stay unanswerable no matter how
  good the MCP layer is. That is an app change, not an MCP change.
- Does the 100%-cap rule on guidelines belong in the MCP write path, or should
  the server allow an over-100% intermediate state that the UI forbids?
