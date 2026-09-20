# Investment Policy

The reasoning behind the target allocation stored in the guidelines gist, and the
operating rules that the guidelines data model cannot express.

This document is the source of truth for **why** each target is what it is. The
guidelines gist is the source of truth for **what** the targets are — when the two
disagree, the gist won and this file is stale.

Portfolio figures quoted below are a snapshot taken 2026-09-20 (total 103 473.34 PLN)
and are illustrative of the reasoning, not live data. Read current numbers from
`get_portfolio` / `get_guidelines`.

## Target allocation

| kind | Row | Target | Snapshot | Why |
|---|---|---|---|---|
| `asset_class` | equity (core) | 52% | 38.1% | Broad global market exposure. The only equity row that grows by default — new equity money lands here. Covers everything not named below. |
| `instrument` | IUIT LN | 8% | 21.8% | S&P 500 information technology. A cap, not an aspiration: sector IT is the portfolio's single largest concentration. |
| `instrument` | XDWT GR | 5% | 11.0% | World information technology. Overlaps IUIT heavily; capped together with it. |
| `instrument` | RBOT LN | 3% | 5.4% | Automation & robotics — thematic satellite. |
| `instrument` | IQQH GR | 2% | 3.0% | Clean energy transition — thematic satellite. |
| `instrument` | SGLN LN | 10% | 16.8% | Physical gold. Diversifier held deliberately, sized as a diversifier rather than a position. |
| `asset_class` | bond | 20% | 4.0% | The stabilising sleeve. Far below target; the priority destination for new money. |

Sum: 100%.

`byAssetClass` reports **equity 80% / bond 20%**, but 10pp of that equity figure is
gold (see [Catalog classification](#catalog-classification-caveat)). The economically
meaningful reading is **70% equities, 10% gold, 20% bonds**.

### Why there is no commodity bucket

A `commodity 5%` bucket existed and was deleted. The shared catalog classifies
physical gold and broad-commodity ETCs as `equity`, and classifies **gold mining
equities** as `commodity`. A commodity bucket was therefore only fillable with
miners — leveraged equity risk (KID 5–6), the opposite of what a commodity sleeve is
held for. Its 5pp went to the equity core rather than to bonds, keeping the bond
target at its previously chosen level.

## The dilution mechanism

`get_buy_plan` and the advice pipeline are **buy-only**. A target set *below* a
holding's current weight therefore reads as "stop buying this; let it dilute" — the
position falls as a percentage while new money goes elsewhere. No sale, no realised
gain, no tax event.

Every over-target row above (IUIT, XDWT, RBOT, IQQH, SGLN) relies on this. The
consequence is that those caps bind slowly:

| Row | Snapshot → target | Portfolio growth needed |
|---|---|---|
| bond | 4.0% → 20% | ≈ 20 700 PLN of new money into bonds alone |
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

The 20% bond target is a single `asset_class` row on purpose: `get_buy_plan` returns
amounts, not fund picks, so naming bond instruments in the guidelines would constrain
nothing that the policy below does not already say.

| Fund | Share of sleeve | TER | KID | Why |
|---|---|---|---|---|
| EUNA GR — iShares Core Global Aggregate Bond EUR Hedged (Acc) | 70% | 0.10% | 2 | Global investment-grade government + corporate, **currency hedged to EUR**, accumulating. The core. |
| IBCI LN — iShares € Inflation Linked Govt Bond (Acc) | 30% | 0.09% | 3 | Inflation protection, which matters for a PLN-denominated goal. Best return/risk in the group (3.01 vs EUNA's 0.78). |

**IBTA LN** (iShares $ Treasury Bond 1-3yr) is the legacy holding and receives no new
money. Unhedged short-duration US Treasuries are a cash proxy carrying FX risk, not
portfolio ballast — rule 7.

Considered and rejected: IS3C GR (EM debt — credit risk, not ballast, 0.50% TER),
IBGL LN (15–30yr — excessive rate risk, KID 5), 18M1 GR (0–6 months — cash, not bonds).

## Catalog classification caveat

The shared catalog's `type` field does not always match an instrument's economic
exposure. Verified cases:

| Instrument | Actually | Catalog `type` |
|---|---|---|
| SGLN, PHAU, VZLD, RMAU, 4GLD, XAD1, XAD5 | physical gold (ETC) | `equity` |
| XDBC, EN4C, AIGE | broad commodities | `equity` |
| GDX, IS0E, G2XJ, CD91 | gold **mining equities** | `commodity` |

The catalog is a public gist shared by every user and is not editable here, so this
cannot be fixed at the source. Any analysis that folds SGLN LN into equities will
overstate equity exposure by its full weight and understate the diversifier sleeve.
State the split explicitly whenever describing risk.

## Open items

The targets above encode an assumed long horizon and a high tolerance for drawdown,
inferred from the existing portfolio rather than stated. Until the horizon, the goal
and the acceptable drawdown are written down, no target here can be defended against
"why that number" — only against "is it internally consistent".
