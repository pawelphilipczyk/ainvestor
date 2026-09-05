# MCP server plan

Plan for exposing this app's data to LLM clients over the **Model Context
Protocol**. Work proceeds in **small, separately-chatted stages**; each stage
ships one PR that passes `npm run check`, `npm run typecheck`, and `npm test`.

**Progress:** Stage 1 is complete and `get_portfolio` from Stage 2 has shipped.
Flip a checkbox to `[x]` when its stage ships (same PR as the code, or a tiny
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
| D1 | Transport | **stdio**, run locally by the MCP client | All data lives in the user's own gists, so no app server or session is needed. Remote HTTP is deferred to Stage 10. |
| D2 | Auth | **GitHub PAT with `gist` scope**, from env | The app's OAuth flow is a *login* flow with cookie sessions, not an authorization server for third-party clients. |
| D3 | Write access | **Read-only through Stage 6**; writes land in Stage 7 behind an env flag | Reads are safe and cover most of the value. Writes need read-modify-write care because the gist API replaces whole files. |
| D4 | Location | **`mcp/` in this repo**, importing `app/lib/*` and `app/features/*` directly | Reuses `fetchEtfs`, `fetchGuidelines`, `fetchCatalog`, and the allocation maths with no package boundary. CI catches drift. |
| D5 | AI advice | **Read stored analyses only** in v1; generating new ones is optional Stage 9 | Generation needs `OPENAI_API_KEY` in the MCP client's environment and costs money per call. |
| D6 | Gist discovery | `AINVESTOR_GIST_ID` when set, otherwise discovery by description | Discovery works (pagination fixed in `app/lib/gist.ts`), but an explicit id avoids listing every gist on every start. |
| D7 | Protocol implementation | **Hand-rolled JSON-RPC over stdio, zero new dependencies** | `@modelcontextprotocol/sdk` pulls in ~90 packages (express, hono, zod, ajv) for what is newline-delimited JSON on stdin/stdout. This repo deliberately runs on three runtime dependencies. Cost: we own protocol correctness — see the note below. |

**Consequence of D7:** `mcp/protocol.ts` pins the revisions we answer
`initialize` with. The current MCP revision is **2025-11-25**. When a newer one
appears, add it to `SUPPORTED_PROTOCOL_VERSIONS` only after checking that our
`tools/list` and `tools/call` shapes are unchanged. Schema of record:
`https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/<version>/schema.ts`.

### Environment variables

Named to match the existing `GH_` / `SHARED_CATALOG_GIST_ID` convention.

| Variable | Required | Description |
|---|---|---|
| `GH_TOKEN` | Yes | GitHub PAT with the **`gist`** scope. Reads and writes the private data gist. |
| `SHARED_CATALOG_GIST_ID` | Yes | Public gist holding `catalog.json`. Same value the app uses. |
| `AINVESTOR_GIST_ID` | No | Private data gist id. When unset, it is discovered by description. |
| `AINVESTOR_MCP_ALLOW_WRITES` | No | Set to `1` to enable the Stage 7 write tools. Default is read-only. |
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
no token required, cached in-process for 60s. `CatalogEntry` carries `ticker`,
`name`, `type`, `description`, and optionally `isin`, `expense_ratio`,
`risk_kid` (1–7), `region`, `sector`, `rate_of_return`, `volatility`,
`return_risk`, `fund_size`, `esg`.

Only the gist **owner** may write it (`isSharedCatalogAdmin()`). The MCP server
**does not** expose catalog writes or bank-JSON import — those stay in the UI.

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

---

## Layout and conventions

```
mcp/
  server.ts            # stdio entry point: stdin lines in, JSON-RPC out
  protocol.ts          # MCP dispatch (initialize, ping, tools/list, tools/call)
  jsonrpc.ts           # JSON-RPC 2.0 types, error codes, single-line framing
  config.ts            # env resolution and validation
  data-gist.ts         # resolves the private data gist id (never creates one)
  tools/portfolio.ts   # get_portfolio
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
| `list_catalog` | Filtered catalog rows (type, region, sector, risk band, ESG, limit) |
| `get_catalog_entry` | One entry by ticker or id, all fields |
| `get_allocation_diagnostics` | Buy-only gaps per bucket for a given cash amount |
| `get_saved_advice` | The stored analysis for `buy_next` or `portfolio_review` |

Resources (Stage 5): `ainvestor://portfolio`, `ainvestor://guidelines`,
`ainvestor://catalog`.

Write (Stage 7, behind `AINVESTOR_MCP_ALLOW_WRITES`): `record_operation`,
`remove_holding`, `set_guideline`, `delete_guideline`.

Never exposed: catalog writes, bank-JSON import, OAuth, session state.

Tools currently return a JSON document inside a single text content block. MCP
also allows `structuredContent` with an `outputSchema` (revision 2025-06-18 and
later). Worth adopting once more than one tool exists, but it duplicates the
payload, so it is not free.

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
  - Create mcp/config.ts: resolve and validate GH_TOKEN, SHARED_CATALOG_GIST_ID, optional AINVESTOR_GIST_ID and AINVESTOR_MCP_ALLOW_WRITES. Throw a clear, actionable error naming the missing variable.
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

- [ ] **Stage 2 — Guidelines read tool** (`get_portfolio` already shipped in Stage 1)

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 1. The plan is agreed — implement directly.

  Goal: get_guidelines, matching the shape of the existing get_portfolio tool in mcp/tools/portfolio.ts.

  Do:
  - Read rows with fetchGuidelines from app/lib/guidelines.ts, using resolveDataGistId from mcp/data-gist.ts for the gist id.
  - Add sumGuidelineTargetPercent so the model sees whether targets add up to 100.
  - Add aggregateGuidelineTargetsByEtfType from app/features/advice/advice-openai.ts so it sees the effective bucket per asset type, not just raw rows. Instrument rows count toward their asset class — that is the single most misread part of this model.
  - Register it in mcp/server.ts next to get_portfolio.

  Constraints:
  - Import the existing helpers; do not reimplement the maths.
  - Follow the summarize/create split used by mcp/tools/portfolio.ts so the pure summary function stays testable without network.

  Test: mock globalThis.fetch as mcp/tools/portfolio.test.ts does. Cover no guidelines, instrument plus asset-class rows of the same type folding into one bucket, and targets summing over 100.

  Verify: npm run check, npm run typecheck, npm test, plus a real stdio handshake (see the Stage 1 probe in the git history).

  Deliverable: one PR.
  ```

- [ ] **Stage 3 — Catalog read tools**

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 2. The plan is agreed — implement directly.

  Goal: list_catalog and get_catalog_entry.

  Do:
  - list_catalog: fetchCatalog from app/features/catalog/lib.ts, with optional filters for etf type, region, sector, risk band (reuse riskBandFromRiskKid), esg, and a free-text query over ticker and name. Support a limit with a sane default.
  - get_catalog_entry: look up by ticker (reuse findCatalogEntryByTicker, which normalises case and spacing) or by id, returning every field.

  Constraints:
  - The catalog can hold hundreds of rows. list_catalog must return a compact projection by default (ticker, name, type, expense_ratio, risk_kid) and only the full row from get_catalog_entry, so a broad listing cannot blow the context window.
  - Do not expose saveCatalog or the bank-JSON import.

  Test: use setSharedCatalogForTests / resetSharedCatalogForTests from app/features/catalog/lib.ts so no network is needed. Cover each filter, the limit, and an unknown ticker.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one PR.
  ```

- [ ] **Stage 4 — Allocation diagnostics tool**

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

- [ ] **Stage 5 — Stored advice tool and MCP resources**

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

- [ ] **Stage 6 — Caching and rate-limit hardening**

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 5. The plan is agreed — implement directly.

  Goal: stop a single model turn from hammering the GitHub API.

  Context: the shared catalog already has a 60s in-process TTL cache, but private gist reads have none. A model can call five tools in one turn, each triggering its own gist GET.

  Do:
  - Add a short in-process TTL cache for private gist reads, following the shape of the shared catalog cache in app/features/catalog/lib.ts (TTL constant, env override, test reset helper).
  - Expose a reset helper for tests.
  - If Stage 7 has already shipped, invalidate the cache on every successful write.

  Constraints:
  - Cache inside mcp/ only. Do not change caching behaviour for the web app.

  Test: assert a second read inside the TTL issues no second fetch, and that an expired entry refetches.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one PR.
  ```

- [ ] **Stage 7 — Write tools (opt-in)**

  ```text
  Read AGENTS.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Continue after Stage 6. The plan is agreed — implement directly.

  Goal: record_operation, remove_holding, set_guideline, delete_guideline.

  Do:
  - Register these tools only when AINVESTOR_MCP_ALLOW_WRITES is enabled. When it is off they must not appear in the tool list at all.
  - Reuse the existing validation: normalizePortfolioOperationInput from app/features/portfolio/portfolio-operation-form/index.ts for buy and sell, and findGuidelineDuplicateOf plus wouldGuidelineTotalExceedCap from app/lib/guidelines.ts for guideline rows.
  - Every write is read-modify-write inside a single tool call: fetch current rows, apply the change, save the full array back.
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
  - Require OPENAI_API_KEY; fail with a clear message when it is absent.
  - Make saving the result to the gist an explicit opt-in argument, defaulting to off.

  Constraints:
  - Each call costs money. Say so in the tool description.
  - Do not fork or reword the system prompts; import them.

  Test: inject a mock client with setAdviceClient, as app/features/advice/advice.test.ts does. Never hit the real API in tests.

  Verify: npm run check, npm run typecheck, npm test.

  Deliverable: one PR.
  ```

- [ ] **Stage 10 — Remote HTTP transport (optional, deferred)**

  ```text
  Read AGENTS.md, docs/REMIX_V3_PACKAGES.md, docs/BIOME_RULES.md, and docs/MCP_SERVER_PLAN.md. Optional stage — only do this if remote access from claude.ai or a phone is actually wanted.

  Goal: reach the same tools over HTTP instead of stdio.

  Before writing code, report back on the auth question and stop for a decision:
  - A static bearer token is roughly a day of work but is not what MCP clients that require OAuth expect.
  - Full OAuth 2.1 (protected-resource metadata, dynamic client registration, PKCE) is a week or more and is disproportionate for a single-user app. The existing GitHub OAuth is a login flow, not an authorization server, and cannot be reused directly.

  If a bearer token is chosen:
  - Mount POST /mcp in app/router.ts and app/routes.ts using the Remix fetch-router, following docs/REMIX_V3_PACKAGES.md.
  - Keep the tool implementations shared with the stdio server; only the transport differs.
  - Read the token from an env secret and compare it with timingSafeEqual, as the OAuth state check in app/features/auth/index.ts does.
  - Add the secret to fly.toml deployment notes and the GitHub Actions secret list in README.md.

  Deliverable: a written recommendation first, then one PR if approved.
  ```

---

## Open questions

- Should the MCP server ever see the preview gist (`ai-investor-preview-data`),
  or is production data the only target? Currently the description depends on
  `FLY_APP_NAME`, which is unset locally, so it resolves to production.
- Is there appetite for adding a **time dimension** (dated transactions) to the
  app? Without it, several natural questions stay unanswerable no matter how
  good the MCP layer is. That is an app change, not an MCP change.
- Does the 100%-cap rule on guidelines belong in the MCP write path, or should
  the server allow an over-100% intermediate state that the UI forbids?
