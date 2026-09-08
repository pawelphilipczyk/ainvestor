# App roadmap

Open product questions that span the whole app, not any one subsystem's own
plan (`docs/MCP_SERVER_PLAN.md`, `docs/REMIX_BETA_MIGRATION_PLAN.md`, …).
Entries here are decisions to make, not stages to implement — once a decision
is made, either implement it directly or write a proper stage plan for it and
link that plan from its entry.

---

## Open questions

- **Add a time dimension (dated transactions)?** The data model has no time
  dimension at all: `EtfHolding.value` (`app/lib/gist.ts`) is a monetary
  value only — no quantity, no price, no date — and buy/sell mutate it in
  place with no transaction history kept anywhere. This bounds every
  consumer of the data equally, not just MCP:
  - Questions like "how did my portfolio do this year", "what did I pay for
    X", or any return/performance figure are unanswerable from stored data,
    by the web app and by any MCP client alike.
  - `docs/MCP_SERVER_PLAN.md`'s "Known gaps in the data model" section
    documents the consequence for MCP tools specifically (`get_buy_plan`,
    `get_portfolio`, etc. must say "unanswerable", never estimate). That
    section should stay as the record of the *symptom*; this entry is the
    record of the *cause*, since fixing it requires a data-model change in
    `app/lib/gist.ts` and every read/write path built on `EtfHolding`, not
    anything scoped to `mcp/`.
  - Not decided: whether to add this at all (it is a real modeling and
    migration cost — existing gist files have no date fields to backfill
    from), and if so, whether transactions are a new parallel record kept
    alongside the current value-only holdings, or a replacement for them.
