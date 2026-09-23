# Investment Policy

The reasoning behind the target allocation stored in the guidelines gist, and the
operating rules that the guidelines data model cannot express.

This document is the source of truth for **why** each target is what it is. The
guidelines gist is the source of truth for **what** the targets are — when the two
disagree, the gist wins and this file is stale.

Portfolio figures quoted below are a snapshot taken 2026-09-20 (total 103 473.34 PLN)
and are illustrative of the reasoning, not live data. Read current numbers from
`get_portfolio` / `get_guidelines`.

## Target allocation

| kind | Row | Class | Target | Snapshot | Why |
|---|---|---|---|---|---|
| `asset_class` | equity (core) | equity | 52% | 38.1% | Broad global market exposure. The only row that grows by default — new equity money lands here. Covers every equity holding not named below. |
| `instrument` | IUIT LN | equity | 8% | 21.8% | S&P 500 information technology. A cap, not an aspiration: sector IT is the portfolio's single largest concentration. |
| `instrument` | XDWT GR | equity | 5% | 11.0% | World information technology. Overlaps IUIT heavily; capped together with it. |
| `instrument` | RBOT LN | equity | 3% | 5.4% | Automation & robotics — thematic satellite. |
| `instrument` | IQQH GR | equity | 2% | 3.0% | Clean energy transition — thematic satellite. |
| `instrument` | SGLN LN | **commodity** | 10% | 16.8% | Physical gold. Diversifier held deliberately, sized as a diversifier rather than a position. |
| `instrument` | EUNA GR | bond | 14% | 0% | Bond sleeve core — see [Bond sleeve](#bond-sleeve). |
| `instrument` | IBCI LN | bond | 6% | 0% | Inflation protection — see [Bond sleeve](#bond-sleeve). |

Sum: 100%. `byAssetClass` reports **equity 70% / bond 20% / commodity 10%**, which is
also the economically meaningful reading — gold is counted as gold.

### Why gold is a class of its own

A `commodity 5%` bucket existed and was deleted, because the shared catalog filed
physical gold under `equity` and filed **gold mining equities** under `commodity` —
so the bucket was only fillable with miners, leveraged equity risk (KID 5–6) and the
opposite of what a commodity sleeve is for. That bucket's 5pp went to the equity core.

The catalog row for SGLN LN has since been corrected to `commodity` and its guideline
row re-saved to pick the new type up, so gold now sits in its own class instead of
inflating the equity figure. The rest of the catalog is still wrong — see
[Catalog classification](#catalog-classification-caveat).

### Why the bond sleeve is two rows and not a bucket

`bond` has no `asset_class` row; EUNA and IBCI carry the whole 20% between them. That
is deliberate. **IBTA LN** then becomes an unnamed bond holding measured against a
class bucket target of 0%, so the diagnostics report that unnamed bond funds can
absorb nothing — which is exactly the intended "do not add to IBTA", encoded in data
rather than left as prose.

## The dilution mechanism

`get_buy_plan` and the advice pipeline are **buy-only**. A target set *below* a
holding's current weight therefore reads as "stop buying this; let it dilute" — the
position falls as a percentage while new money goes elsewhere. No sale, no realised
gain, no tax event.

Every over-target row above (IUIT, XDWT, RBOT, IQQH, SGLN) relies on this. The
consequence is that those caps bind slowly:

| Row | Snapshot → target | Portfolio growth needed |
|---|---|---|
| bond (EUNA + IBCI) | 4.0% → 20% | ≈ 20 700 PLN of new money into bonds alone |
| SGLN LN | 16.8% → 10% | ≈ 1.7× (to ~174 000 PLN) |
| XDWT GR | 11.0% → 5% | ≈ 2.2× |
| IUIT LN | 21.8% → 8% | ≈ 2.7× (to ~282 000 PLN) |

The bond sleeve closes on a realistic horizon. The IT caps are a multi-year target,
accepted knowingly. **Revision trigger:** if any single position exceeds its target by
more than 15pp, reconsider whether dilution alone is still the right tool.

## Operating rules

These are not expressible as guideline rows. They belong in the prompt context.

1. **Tolerance bands.** Asset classes ±5pp, individual funds ±3pp. Inside the band,
   do nothing.
2. **Contribution routing.** New money goes to the largest gap in percentage points.
   Never into a position already at or above its target.
3. **No selling.** Exception to reconsider: a position more than 15pp above target.
4. **Sector limit.** Information technology ≤ 15% of the portfolio in total, counting
   IT held inside core funds. IUIT + XDWT targets (13%) sit under this deliberately.
5. **Thematic limit.** RBOT + IQQH ≤ 5% combined.
6. **No duplicate listings.** UDVD LN and SPYD GR are the same fund (SPDR S&P US
   Dividend Aristocrats) on two listings — 6.07% combined at the snapshot. Buy only
   UDVD LN; let SPYD GR sit.
7. **Currency.** The portfolio is measured in PLN while the assets are USD/EUR
   denominated. The stabilising sleeve should not add currency risk on top of its
   interest-rate risk.

## Bond sleeve

| Fund | Target | Share of sleeve | TER | KID | Why |
|---|---|---|---|---|---|
| EUNA GR — iShares Core Global Aggregate Bond EUR Hedged (Acc) | 14% | 70% | 0.10% | 2 | Global investment-grade government + corporate, **currency hedged to EUR**, accumulating. The core. |
| IBCI LN — iShares € Inflation Linked Govt Bond (Acc) | 6% | 30% | 0.09% | 3 | Inflation protection, which matters for a PLN-denominated goal. Best return/risk in the group (3.01 vs EUNA's 0.78). |

**IBTA LN** (iShares $ Treasury Bond 1-3yr) is the legacy holding and receives no new
money. Unhedged short-duration US Treasuries are a cash proxy carrying FX risk, not
portfolio ballast — rule 7. No guideline row names it, which is what makes the
diagnostics report zero room for it.

Considered and rejected: IS3C GR (EM debt — credit risk, not ballast, 0.50% TER),
IBGL LN (15–30yr — excessive rate risk, KID 5), 18M1 GR (0–6 months — cash, not bonds).

## Catalog classification caveat

The shared catalog's `type` field is systematically wrong for commodities. This is an
import defect, not a handful of typos: **every** physical and futures-based commodity
product found so far is filed under `equity` — gold, silver, platinum, palladium,
copper, nickel, wheat, corn, sugar, coffee, cocoa, WTI and Brent crude, natural gas,
uranium, battery metals, every broad commodity basket, and the leveraged ETCs. Filed
under `commodity`, meanwhile, are **equity** funds: gold miners (GDX, IS0E, G2XJ,
CD91) and agribusiness (ISAG).

A keyword survey found 45+ affected rows out of 620 and cannot prove it found them
all — `list_catalog` has no offset and caps at 100 rows per query, so the catalog
cannot be enumerated through the MCP tools.

**SGLN LN has been corrected to `commodity`** and its guideline row re-saved so the
new type took effect. Nothing else has been touched: a catalog corrected in 45 places
out of an unknown total is worse than one that is uniformly wrong, because it stops
being possible to tell which rows can be trusted. Correcting the rest needs the whole
file enumerated — `SHARED_CATALOG_GIST_ID` gives read access to do that properly.

Until then, treat any `commodity`/`equity` reading of a fund outside this portfolio as
unverified.

### Guideline rows store the type they were written with

`set_guideline` copies `etfType` from the catalog at write time, while holdings are
classified against the catalog at read time. Change a catalog row's type and the two
drift apart silently: the fund's target counts toward its old class while the holding
itself counts toward the new one. The class the fund moved to then looks empty, and a
buy plan will recommend filling it.

This was observed live: right after SGLN was reclassified, `get_buy_plan` reported
`commodity currentValue: 0` and proposed buying 7 502 PLN of gold against a position
already 40% above target.

The allocation diagnostics now refuse to produce figures in this state
(`instrument_type_mismatch`): when a guideline names a ticker that is held and the
two disagree about its class, `get_buy_plan` returns the reason instead of numbers,
and the advice prompt is told to propose no purchases. The remedy it names is the
one that works — **re-save the guideline row**, which re-reads the type from the
catalog. That guard ships on this branch, so it only protects the live tools once
the branch is deployed.

## Drawdown

Drawdown tolerance is an **input to choosing the allocation**, never a trigger to act.
Its whole job is done in advance, while calm: pick the mix whose plausible worst case
can be held without selling. If the number ever gets "used", it has failed.

Under a buy-only policy the failure mode is not panic selling — selling is already out
of scope. It is one of:

- stopping contributions until things "settle down",
- redirecting contributions away from the class that fell — which is precisely the
  class rule 2 sends them to,
- revising the guidelines mid-fall, which is capitulation wearing a spreadsheet.

**Adopted rule: no revision of the guidelines while the portfolio is in drawdown.**
Contributions keep following rule 2 throughout, into whatever has fallen furthest
below target. Revision resumes only after the portfolio has recovered a set share of
the fall.

Rough magnitudes for the two mixes, as orders of magnitude and not forecasts: the
target mix (70/10/20) around -30 to -35% in a severe bear market; the snapshot mix
(79% equities with 33pp in IT, 17% gold, 4% bonds) around -40%, and worse in a
scenario centred on technology.

## Open items

Three numbers are still unset, and the targets above cannot be defended against "why
that number" until they are — only against "is this internally consistent":

- **Horizon** in years.
- **Expected maximum drawdown**, the figure the allocation is chosen to survive.
- **Revision-freeze threshold**: the drawdown below which the guidelines are frozen,
  and the recovery point at which revision resumes.

These belong in stored data next to the guidelines rather than only in this file, so
they reach the advice prompts as context. The app has no time dimension — no prices,
no dates, no transaction history — so it can never measure an actual drawdown; these
values serve as stated intent that a reviewing model can check a recommendation
against, not as something the system enforces.
