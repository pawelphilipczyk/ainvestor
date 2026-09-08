import type { EtfEntry } from '../../lib/gist.ts'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import { type EtfType, formatEtfTypeLabel } from '../../lib/guidelines.ts'
import {
	LOCALE_DECIMAL_HTML_PATTERN,
	parseLocaleDecimalString,
} from '../../lib/locale-decimal-input.ts'
import type { CatalogEntry } from '../catalog/lib.ts'
import type { AdviceClient } from './advice-client.ts'
import { type AdviceDocument, parseAdviceDocument } from './advice-document.ts'

export type { EtfEntry } from '../../lib/gist.ts'
export type { AdviceDocument } from './advice-document.ts'

const BUY_ONLY_USER_BLOCK = `---
Hard constraint (mandatory): I **cannot sell** any ETF holdings — I may **only add** new purchases with the deployable cash. Do **not** recommend selling, trimming, reducing, redeeming, switching out of, or exiting any position. Overweight sleeves stay as-is; rebalance **only** by buying underweights. If some guideline targets cannot be reached without selling, say that clearly and get **as close as possible** with buys only.

`

const SYSTEM_PROMPT = `You are a financial advisor specialising in ETF portfolio allocation.

**Audience:** The reader is new to investing. Keep all **paragraph** text and **etf_proposals** **note**
fields short, friendly, and easy to scan. Prefer plain words; if you use a term like "rebalance" or
"allocation", add a few words so a beginner knows what you mean. No dense paragraphs or jargon stacks.

Inputs: target allocation (if any), ETF-only allocation summary, ETF catalog, current holdings,
**deployable cash** (amount and currency). Catalog is the only source for tickers and cited stats.

**Hard constraint — buy only:** The user **never sells**. Recommend **only purchases** (new ETFs or
adds to held tickers). Never suggest selling, trimming, reducing, redeeming, exiting, or rotating out of
holdings to rebalance. Overweight buckets: acknowledge the gap but **do not** propose selling; only buy
underweights with the cash. If targets are unreachable without sells, state that and optimise **buy-only**
closeness.

**Deployable cash** is not included in the ETF summary totals; do not treat it as total net worth or
merge it into current-state percentage denominators. Use it only as capital to **buy** (new funds or
adds to held tickers).

**When the user provided target allocation percentages, those % are the desired mix of the *entire*
ETF portfolio *after* this cash is invested** — i.e. each line's target share of
**(current holding values + this deployable cash, once fully deployed into ETFs)**. They are **not**
the split of the new cash alone; do not allocate 60/40 of *only* the deposit to match a 60/40 target.
Work backwards from the end state: from holdings + planned buys, estimate **post-purchase** weights
(by asset class and, where relevant, by named fund) and choose buys so those **whole-portfolio**
percentages land on the targets as closely as this cash allows. If one currency, use one combined
total; if mixed, state a reasonable assumption and still reason in **post-buy portfolio %** vs targets.
Prioritise the largest gaps in that **post-buy** picture. **Per asset type (equity, bond, etc.), every
guideline line with that type counts toward one combined bucket target:** add the **target %** of all
asset-class bucket lines and all named-fund (instrument) lines that share the same type. The
**effective target for that class** is that sum (normalize against the sum of **all** guideline lines
if totals are not 100%). Named-fund lines are **part of** that bucket — do not treat class and fund
targets as independent stacks that both need full weight; compare **post-purchase** class weight to
the **aggregated** class total, and fund-level targets within the same type to their lines.

**When there are no targets**, suggest prudent deployment from the catalog consistent with holdings.

If the user message contains **"Arithmetic for totals (authoritative"**, copy those figures exactly for
pre-investment holdings sum, deployable cash, and **post-investment total portfolio value** — do not
recalculate a different total (e.g. do not confuse target percentages with the portfolio denominator).
If it flags mixed currencies or unparsed cash, obey that constraint.

If **"Server allocation diagnostics"** is present, it is a **buy-only numerical plan by asset-class
bucket** (from the server). Use those figures to guide your "Current state analysis" interpretation
(reference gaps by name, not by restating the same numbers). Then map buckets to catalog ETFs;
**etf_proposals** amounts must match the deployment line items (± rounding).

Base every specific ETF pick on the catalog; do not invent performance, risk, or cost figures.

You MUST respond with a single JSON object only (no markdown code fences, no extra text). Shape:
{
  "blocks": [
    { "type": "capital_snapshot", "segments": [
      { "role": "holdings", "label": "Current ETF holdings", "amount": 10000, "currency": "USD" },
      { "role": "cash", "label": "Deployable cash", "amount": 2000, "currency": "USD" }
    ], "postTotal": { "label": "Total portfolio (holdings + cash)", "amount": 12000, "currency": "USD" } },
    { "type": "guideline_bars", "caption": "optional short heading", "rows": [
      { "label": "Equities (bucket)", "targetPct": 60, "currentPct": 45, "postBuyPct": 58 }
    ]},
    { "type": "paragraph", "text": "..." },
    { "type": "etf_proposals", "caption": "optional short heading", "rows": [
      { "name": "Fund name", "ticker": "VTI", "catalogEntryId": "optional stable id from catalog row if known", "amount": 500, "currency": "USD", "note": "optional rationale" }
    ]}
  ]
}

**Block order:** Prefer **capital_snapshot** first, then **guideline_bars** (when guidelines exist), then
the narrative **paragraph**, then **etf_proposals** when you have concrete purchase rows.

**capital_snapshot (opening summary bar):** Use figures from **"Arithmetic for totals (authoritative"** in
the user message when present — same currency for **holdings** and **cash** segments; **amount** values
must match that block. Exactly one segment with **role** "holdings" and one with "cash" when both are
known. **postTotal** is optional; when set, **amount** should match holdings + deployable cash (pre-buy
total portfolio value before your buys are applied — i.e. sum of the two segments). **label** strings
are short human labels (you may adjust wording). Do not repeat these numeric totals in prose; they are
shown visually in this block.

**guideline_bars:** Include when the user has allocation guidelines. **rows** cover each relevant bucket
(asset class and/or named-fund lines aggregated as in the buy-only rules). **targetPct**, **currentPct**,
and **postBuyPct** are **whole-portfolio percentages** (0–100), aligned with the same aggregation you use
in analysis. **postBuyPct** is optional but strongly preferred when you propose buys — it is the estimated
weight **after** your **etf_proposals** are applied. Omit **guideline_bars** entirely when there are no
targets. Do not repeat these percentages in prose; reference them by bucket name for interpretation only.

Cover this substance across your blocks (paragraph text can use headings and bullets inside the string):

## Current state analysis
- One paragraph block **after** the visual blocks, bullet lines only ("- ").
- Do **not** repeat the same numeric snapshot already shown in **capital_snapshot** and **guideline_bars**
  (no duplicate holdings/cash totals or per-bucket % tables); use bullets for interpretation, remaining
  gaps, and buy-only caveats.
- Mirror the allocation context (by asset type). **If targets exist:** briefly say what is **too low**
  or **too high** before buys, and what looks better **after** your proposed buys; if buys cannot fully
  fix a gap, say that in one plain sentence.
- **Roughly 3–8 bullets**, each **one short line** (one idea per bullet).

## Next best picks
- At most 3 numbered picks (1. 2. 3.). Each starts with \`TICKER — Full fund name\` from the catalog.
  Empty catalog → asset-class only, no invented tickers.
- **One short line** under each pick: what this buy does for the portfolio in beginner terms (e.g. "Adds
  more bonds so you are closer to your target mix"). Only mention a catalog stat if it helps that one
  idea; skip stat dumps.
- Prefer adds to held tickers when that hits a target; otherwise new catalog funds. Order by impact on
  guideline alignment.

**etf_proposals (use when targets or cash deployment should be concrete):** rows should **fully deploy**
the user's cash (same currency; say so if FX mixing forces approximation). Sums are **only this inflow**
(positive purchase amounts only — **never** negative or "sell" rows); **justify** row sizes so
**post-purchase total portfolio** (holdings + buys) best matches the guideline % under the buy-only rule.
Sum of row amounts ≈ deployable cash unless you explain rounding. **note** (when present): **one short
sentence** a beginner can read at a glance — same tone as the paragraph bullets.

Rules:
- **Never** recommend or imply selling; violations invalidate the response.
- Include at least one block. Use **capital_snapshot** and **guideline_bars** for the visual opening when
  applicable; use "paragraph" for narrative and optional "etf_proposals" for rows.
- When targets exist, prefer a non-empty "etf_proposals" that deploys the cash; only omit the table if
  you truly cannot map buys to the catalog.
- "amount" and "currency" are optional for each row; when you suggest a purchase amount, include both
  "amount" (number) and "currency" (ISO code: PLN, USD, EUR, GBP, CHF, JPY, CAD, AUD, SEK, or NOK).
- When the catalog line for a pick includes a stable **id** field, set **catalogEntryId** to that string on the matching **etf_proposals** row (omit if unknown).
- Use plain text in "text" and "note" fields (no HTML tags).

Do not provide legal or tax advice; only portfolio allocation guidance.`

/**
 * Qualitative portfolio health review (balance, risk, improvements) using holdings + catalog +
 * optional guidelines. Unlike buy-next advice, this mode may discuss rebalancing and concentration
 * in general terms; it does not output purchase rows.
 *
 * Prompt structure draws on common “portfolio review” patterns: flag concentration vs
 * diversification, compare mix to stated targets, note missing sleeves or geographic/sector skew,
 * and suggest improvements without asserting future returns.
 */
const PORTFOLIO_REVIEW_SYSTEM_PROMPT = `You are a financial educator reviewing an ETF-only portfolio for balance and risk.

**Audience:** The reader is new to investing. Use **short sentences** and **everyday words**. Explain
ideas simply (e.g. what "diversified" means in one line). Avoid long technical lists.

Inputs: current holdings, allocation summary (by asset type from catalog mapping), ETF catalog,
and optional target-allocation guidelines. The catalog is the only source for tickers and cited stats.

**Task:** Give a concise, honest qualitative review. Cover:
1. **Balance & diversification** — in plain language: is the mix spread across types of investments, or
   heavily in one fund or category? Mention overlap or geography/sector only when the catalog supports it
   and it helps the reader.
2. **Risk posture** — in simple terms (e.g. "mostly stocks tends to swing more than mostly bonds"). Use
   catalog fields (volatility, return/risk, risk score) only as light support; do not invent numbers.
3. **Vs guidelines** — if targets exist, say in a few bullets whether they are roughly on track or not
   (by bucket), without repeating a full percentage table. If there are no guidelines, say the review is
   based on holdings and catalog only.
4. **What could improve** — a **short numbered or bulleted list** of practical ideas (e.g. spread out
   more, add a missing type of fund, move toward targets). You may mention rebalancing or trimming **as
   general portfolio practice**; this is not a trade order.

**Rules:**
- Base every specific fund reference on the catalog; do not invent performance, risk, or cost figures.
- Be clear this is educational commentary, not personalized investment advice.
- Do not provide legal or tax advice.

You MUST respond with a single JSON object only (no markdown code fences, no extra text). Shape:
{
  "blocks": [
    { "type": "paragraph", "text": "..." }
  ]
}

Use **only** "paragraph" blocks (one or more). Merge sections with clear headings inside the string
(e.g. "## Balance", "## Risk", "## vs targets", "## Improvements") or bullet lines ("- ").
Do **not** include "etf_proposals" blocks. **Roughly 8–16 short bullets** (or the same ideas in a few
short paragraphs); prefer fewer, clearer points over many thin bullets.`

/** How the advice page uses the model: next purchases vs qualitative portfolio review. */
export const ADVICE_ANALYSIS_MODES = ['buy_next', 'portfolio_review'] as const

export type AdviceAnalysisMode = (typeof ADVICE_ANALYSIS_MODES)[number]

export const DEFAULT_ADVICE_ANALYSIS_MODE: AdviceAnalysisMode = 'buy_next'

/** Normalize tab / mode strings from URLs or stale props to a known analysis mode. */
export function normalizeAdviceAnalysisTab(
	tab: string | undefined | null,
): AdviceAnalysisMode {
	if (tab === 'portfolio_review' || tab === 'buy_next') {
		return tab
	}
	return DEFAULT_ADVICE_ANALYSIS_MODE
}

/**
 * OpenAI chat models offered for ETF advice, best first (user-selectable).
 *
 * The GPT-5.6 family replaces the GPT-5.4/5.5 models this app used before: Sol scores higher
 * than GPT-5.5 at the same list price ($5 / $30 per 1M input / output tokens), so GPT-5.5 and the
 * whole 5.4 line are strictly worse deals and were dropped. GPT-6 Astra is deliberately not here:
 * it costs $10 / $50 per 1M tokens and is still behind limited access, which buys little on a
 * prompt this small.
 *
 * - `gpt-5.6-sol` — flagship reasoning ($5 / $30 per 1M). Noticeably pricier per call than Terra
 *   for a gain the advice prompt rarely needs; still offered so a user can opt into it.
 * - `gpt-5.6-terra` — balanced ($2 / $12 per 1M). Used for the advice itself.
 * - `gpt-5.6-luna` — cheap and fast ($0.20 / $1.20 per 1M). Used for catalog fund write-ups.
 */
export const ADVICE_MODEL_IDS = [
	'gpt-5.6-sol',
	'gpt-5.6-terra',
	'gpt-5.6-luna',
] as const

export type AdviceModelId = (typeof ADVICE_MODEL_IDS)[number]

/**
 * Advice is the reasoning-heavy call (holdings + guidelines + catalog + buy-only arithmetic), so
 * it does not default to the cheapest tier — but a real generate_advice call over MCP was seen
 * costing around €0.50 on Sol, and the balanced tier gives materially the same result at a
 * fraction of the price, so that is the default rather than the flagship. A user who wants the
 * top tier can still pick `gpt-5.6-sol` explicitly, in the web UI or via generate_advice's model
 * argument.
 */
export const DEFAULT_ADVICE_MODEL: AdviceModelId = 'gpt-5.6-terra'

/**
 * Explaining one catalog fund is a summarize-one-line task, so it defaults to the cheap tier
 * (~10x cheaper than the advice default) instead of paying balanced-tier rates for every ETF page.
 */
export const DEFAULT_CATALOG_ETF_MODEL: AdviceModelId = 'gpt-5.6-luna'

export function formatGuidelineLine(guideline: EtfGuideline): string {
	if (guideline.kind === 'asset_class') {
		return `- Asset class ${formatEtfTypeLabel(guideline.etfType)}: ${guideline.targetPct}% (bucket)`
	}
	return `- ${guideline.etfName} (${formatEtfTypeLabel(guideline.etfType)}): ${guideline.targetPct}% (specific fund — counts toward the **${formatEtfTypeLabel(guideline.etfType)}** class total together with any other lines of the same type)`
}

/**
 * Sum guideline target % by `etfType` (instrument + asset_class rows both contribute).
 * `sumAll` is the sum of every line — used as the normalization denominator for bucket scaling.
 */
export function aggregateGuidelineTargetsByEtfType(
	guidelines: EtfGuideline[],
): {
	byType: Map<EtfType, number>
	sumAll: number
} {
	const byType = new Map<EtfType, number>()
	let sumAll = 0
	for (const guideline of guidelines) {
		sumAll += guideline.targetPct
		byType.set(
			guideline.etfType,
			(byType.get(guideline.etfType) ?? 0) + guideline.targetPct,
		)
	}
	return { byType, sumAll }
}

export function formatAggregatedGuidelineBucketsBlock(
	guidelines: EtfGuideline[],
): string | null {
	if (guidelines.length === 0) return null
	const { byType, sumAll } = aggregateGuidelineTargetsByEtfType(guidelines)
	if (sumAll <= 0) return null
	const parts = [...byType.entries()]
		.filter(([, targetPercentage]) => targetPercentage > 0)
		.sort((a, b) => b[1] - a[1])
		.map(
			([etfType, targetPercentage]) =>
				`- ${formatEtfTypeLabel(etfType)}: **${targetPercentage}%** (sum of all guideline lines with this type)`,
		)
	const lines = [
		'---',
		'**Effective target % by asset class** (instrument lines and asset-class lines **combine** by asset type; use these bucket totals for post-portfolio class weights — do not double-count):',
		...parts,
		`- Sum of all guideline line targets: ${sumAll}% (use as denominator when scaling to 100% or to the post-investment portfolio).`,
	]
	return lines.join('\n')
}

export const ADVICE_CASH_AMOUNT_HTML_PATTERN = LOCALE_DECIMAL_HTML_PATTERN
export const parseAdviceCashAmount = parseLocaleDecimalString

function sumHoldingsValues(holdings: EtfEntry[]): {
	total: number
	currency: string | null
	mixed: boolean
} {
	if (holdings.length === 0) {
		return { total: 0, currency: null, mixed: false }
	}
	const firstCurrency = holdings[0].currency
	const mixed = holdings.some((holding) => holding.currency !== firstCurrency)
	if (mixed) {
		return { total: 0, currency: null, mixed: true }
	}
	const total = holdings.reduce((sum, holding) => sum + holding.value, 0)
	return { total, currency: firstCurrency, mixed: false }
}

/** Authoritative pre/post totals so the model does not invent wrong portfolio sums. */
export function formatPostInvestmentTotalsBlock(params: {
	holdings: EtfEntry[]
	cashAmount: string
	cashCurrency: string
}): string {
	const cashNum = parseAdviceCashAmount(params.cashAmount)
	const {
		total: holdingsTotal,
		currency: holdingsCurrency,
		mixed,
	} = sumHoldingsValues(params.holdings)

	const lines: string[] = [
		'---',
		'Arithmetic for totals (authoritative — copy these numbers into "Current state analysis"; do not substitute different portfolio or post-investment totals):',
	]

	if (cashNum === null) {
		lines.push(
			`- Could not parse deployable cash "${params.cashAmount}" as a non-negative number; do not state a numeric post-investment total until the user fixes the amount.`,
		)
		return lines.join('\n')
	}

	lines.push(
		`- Deployable cash (parsed): ${cashNum.toFixed(2)} ${params.cashCurrency}`,
	)

	if (mixed) {
		lines.push(
			'- Holding line items use mixed currencies; do not add holdings + cash into one total. Describe pre/post in each currency separately or give qualitative guidance only.',
		)
		return lines.join('\n')
	}

	if (params.holdings.length === 0) {
		lines.push(
			'- Sum of ETF holding values (pre-investment): 0 (no positions).',
		)
		if (params.cashCurrency !== holdingsCurrency && holdingsCurrency !== null) {
			lines.push(
				`- Cash currency (${params.cashCurrency}) differs from holding currency; do not add into one total without conversion.`,
			)
			return lines.join('\n')
		}
		const postTotalCashOnly = cashNum
		lines.push(
			`- **After fully investing this deployable cash into ETFs, total ETF portfolio value = ${postTotalCashOnly.toFixed(2)} ${params.cashCurrency}** (all new money in this scenario).`,
		)
		return lines.join('\n')
	}

	lines.push(
		`- Sum of ETF holding line-item values (pre-investment, excludes deployable cash): ${holdingsTotal.toFixed(2)} ${holdingsCurrency ?? params.cashCurrency}`,
	)

	if (holdingsCurrency !== params.cashCurrency) {
		lines.push(
			`- Cash is in ${params.cashCurrency} but holdings are in ${holdingsCurrency}; do not add into one combined total without an explicit FX assumption.`,
		)
		return lines.join('\n')
	}

	const postTotal = holdingsTotal + cashNum
	lines.push(
		`- **After fully investing this deployable cash into ETFs, total ETF portfolio value = ${holdingsTotal.toFixed(2)} + ${cashNum.toFixed(2)} = ${postTotal.toFixed(2)} ${params.cashCurrency}**`,
	)
	return lines.join('\n')
}

function findCatalogMatch(
	holding: EtfEntry,
	catalog: CatalogEntry[],
): CatalogEntry | undefined {
	const fromTicker = holding.ticker?.trim()
	if (fromTicker) {
		const tickerUpper = fromTicker.toUpperCase()
		const matched = catalog.find(
			(entry) => entry.ticker.toUpperCase() === tickerUpper,
		)
		if (matched) return matched
	}
	const name = holding.name.trim()
	if (!name) return undefined
	const lower = name.toLowerCase()
	return catalog.find(
		(entry) =>
			entry.ticker.toUpperCase() === name.toUpperCase() ||
			entry.name.toLowerCase() === lower,
	)
}

/**
 * When the catalog has no row, match a holding to an **instrument** guideline by the same
 * ticker/name rules as `findCatalogMatch` (etfName plays the role of catalog ticker + name).
 */
function findInstrumentGuidelineEtfType(
	holding: EtfEntry,
	guidelines: EtfGuideline[],
): EtfType | undefined {
	for (const guideline of guidelines) {
		if (guideline.kind !== 'instrument') continue
		const fromTicker = holding.ticker?.trim()
		if (fromTicker) {
			const tickerUpper = fromTicker.toUpperCase()
			if (guideline.etfName.trim().toUpperCase() === tickerUpper)
				return guideline.etfType
		}
		const name = holding.name.trim()
		if (!name) continue
		const lower = name.toLowerCase()
		const guidelineEtfName = guideline.etfName.trim()
		if (
			guidelineEtfName.toUpperCase() === name.toUpperCase() ||
			guidelineEtfName.toLowerCase() === lower
		) {
			return guideline.etfType
		}
	}
	return undefined
}

function resolveHoldingEtfTypeForAdviceDiagnostics(
	holding: EtfEntry,
	catalog: CatalogEntry[],
	guidelines: EtfGuideline[],
): EtfType {
	const matchedEntry = findCatalogMatch(holding, catalog)
	if (matchedEntry) return matchedEntry.type
	return findInstrumentGuidelineEtfType(holding, guidelines) ?? 'mixed'
}

export type AdviceBucketDiagnostic = {
	/** Human label, e.g. "equity". */
	label: string
	etfType: EtfType
	targetPct: number
	currentAmt: number
	/** Target currency value after full cash deployment (post-total × target %). */
	targetAmtPost: number
	/** max(0, targetAmtPost - currentAmt); buy-only, no sells. */
	idealBuyMin: number
}

export type AdviceAllocationDiagnostics = {
	postTotal: number
	currency: string
	rows: AdviceBucketDiagnostic[]
	sumIdealBuyMin: number
	targetPctSum: number
}

/**
 * Why diagnostics could not be computed. Each value is a distinct, reportable
 * cause — the advice prompt only needs "not available", but a caller that shows
 * the reason to a user (the MCP tool) must not collapse them into one message.
 */
export type AllocationDiagnosticsBlocker =
	| 'unparseable_cash'
	| 'mixed_holding_currencies'
	| 'cash_currency_mismatch'
	| 'no_guidelines'
	| 'no_positive_targets'
	| 'unclassified_holding'

export type BlockedAllocationDiagnostics = {
	blocker: AllocationDiagnosticsBlocker
	diagnostics: null
	/** Currency the holdings share, when it is the mismatch that blocks. */
	holdingsCurrency?: string
	/** The holding that falls outside every targeted bucket. */
	unclassifiedHolding?: { name: string; etfType: EtfType }
}

export type AdviceAllocationDiagnosticsOutcome =
	| { blocker: null; diagnostics: AdviceAllocationDiagnostics }
	| BlockedAllocationDiagnostics

/**
 * Dollar diagnostics by **aggregated asset-class bucket** (every guideline line counts toward its
 * `etfType`; same-type lines are summed), or the reason there are none.
 *
 * The guard order matters and is the reported order: cash is parsed first
 * because nothing else is worth checking against an amount that is not a
 * number, and a holding's bucket is resolved last because it needs the targets.
 */
export function computeAdviceAllocationDiagnosticsOutcome(params: {
	holdings: EtfEntry[]
	guidelines: EtfGuideline[]
	cashAmount: string
	cashCurrency: string
	catalog: CatalogEntry[]
}): AdviceAllocationDiagnosticsOutcome {
	const cashNum = parseAdviceCashAmount(params.cashAmount)
	if (cashNum === null) {
		return { blocker: 'unparseable_cash', diagnostics: null }
	}

	const {
		total: holdingsTotal,
		currency: holdingsCurrency,
		mixed,
	} = sumHoldingsValues(params.holdings)
	if (mixed) {
		return { blocker: 'mixed_holding_currencies', diagnostics: null }
	}
	if (params.holdings.length > 0 && holdingsCurrency !== params.cashCurrency) {
		return {
			blocker: 'cash_currency_mismatch',
			diagnostics: null,
			...(holdingsCurrency === null ? {} : { holdingsCurrency }),
		}
	}

	if (params.guidelines.length === 0) {
		return { blocker: 'no_guidelines', diagnostics: null }
	}

	const { byType: targetPctByType, sumAll: targetPctSum } =
		aggregateGuidelineTargetsByEtfType(params.guidelines)
	if (targetPctSum <= 0) {
		return { blocker: 'no_positive_targets', diagnostics: null }
	}

	const currentByType = new Map<EtfType, number>()
	for (const holding of params.holdings) {
		const holdingEtfType = resolveHoldingEtfTypeForAdviceDiagnostics(
			holding,
			params.catalog,
			params.guidelines,
		)
		if (
			holding.value > 0 &&
			(holdingEtfType === 'mixed' || !targetPctByType.has(holdingEtfType))
		) {
			return {
				blocker: 'unclassified_holding',
				diagnostics: null,
				unclassifiedHolding: {
					name: holding.name,
					etfType: holdingEtfType,
				},
			}
		}
		currentByType.set(
			holdingEtfType,
			(currentByType.get(holdingEtfType) ?? 0) + holding.value,
		)
	}

	const postTotal = holdingsTotal + cashNum
	const rows: AdviceBucketDiagnostic[] = [...targetPctByType.entries()]
		.filter(([, pct]) => pct > 0)
		.sort((a, b) => b[1] - a[1])
		.map(([etfType, combinedTargetPct]) => {
			const scale = combinedTargetPct / targetPctSum
			const targetAmtPost = postTotal * scale
			const currentAmt = currentByType.get(etfType) ?? 0
			const idealBuyMin = Math.max(0, targetAmtPost - currentAmt)
			return {
				label: formatEtfTypeLabel(etfType),
				etfType,
				targetPct: combinedTargetPct,
				currentAmt,
				targetAmtPost,
				idealBuyMin,
			}
		})

	const sumIdealBuyMin = rows.reduce((sum, row) => sum + row.idealBuyMin, 0)
	return {
		blocker: null,
		diagnostics: {
			postTotal,
			currency: params.cashCurrency,
			rows,
			sumIdealBuyMin,
			targetPctSum,
		},
	}
}

/**
 * The same diagnostics without the reason, for callers that only branch on
 * whether there are numbers to show.
 */
export function computeAdviceAllocationDiagnostics(params: {
	holdings: EtfEntry[]
	guidelines: EtfGuideline[]
	cashAmount: string
	cashCurrency: string
	catalog: CatalogEntry[]
}): AdviceAllocationDiagnostics | null {
	return computeAdviceAllocationDiagnosticsOutcome(params).diagnostics
}

/** Currency amounts below this are rounding noise, not a real shortfall or remainder. */
const CASH_DEPLOYMENT_EPSILON = 0.01

export type AdviceCashDeploymentRow = {
	etfType: EtfType
	label: string
	/**
	 * Cash going to this bucket's minimum buy — the full minimum when the cash
	 * covers every bucket, otherwise this bucket's proportional share of it.
	 */
	minimumBuyShare: number
	/** Target-weighted share of whatever is left once every minimum buy is met; 0 when short. */
	remainderShare: number
	/** What to actually put into this bucket: the two shares above. */
	amount: number
}

export type AdviceCashDeployment = {
	/** Whether the cash reaches every bucket's minimum buy. */
	coversAllMinimumBuys: boolean
	/** Cash left after the minimum buys; 0 when the cash does not cover them. */
	remainder: number
	rows: AdviceCashDeploymentRow[]
}

/**
 * Split the deployable cash across the buckets, buy-only.
 *
 * Short of the minimum buys, every bucket gets a share proportional to its own
 * minimum, so the shortfall is felt evenly. With cash to spare, each minimum is
 * met in full and the remainder is spread by target weight, which preserves the
 * intended mix instead of piling the extra into one bucket.
 *
 * That remainder is all but unreachable and the branch is kept as a safety net:
 * the targets scale to the post-investment total, so the gaps sum to exactly the
 * cash unless a bucket is overweight — and an overweight bucket is clamped to a
 * zero minimum, which pushes the sum *above* the cash into the other branch. In
 * practice `remainder` is therefore 0 or float noise, which the epsilon absorbs.
 */
export function planAdviceCashDeployment(params: {
	diagnostics: AdviceAllocationDiagnostics
	cashAmount: number
}): AdviceCashDeployment {
	const { diagnostics, cashAmount } = params
	const { rows, sumIdealBuyMin, targetPctSum } = diagnostics

	if (sumIdealBuyMin > cashAmount + CASH_DEPLOYMENT_EPSILON) {
		return {
			coversAllMinimumBuys: false,
			remainder: 0,
			rows: rows.map((row) => {
				const share =
					sumIdealBuyMin > CASH_DEPLOYMENT_EPSILON
						? (row.idealBuyMin / sumIdealBuyMin) * cashAmount
						: 0
				return {
					etfType: row.etfType,
					label: row.label,
					minimumBuyShare: share,
					remainderShare: 0,
					amount: share,
				}
			}),
		}
	}

	const remainder = Math.max(0, cashAmount - sumIdealBuyMin)
	return {
		coversAllMinimumBuys: true,
		remainder,
		rows: rows.map((row) => {
			const remainderShare =
				remainder > CASH_DEPLOYMENT_EPSILON
					? remainder * (row.targetPct / targetPctSum)
					: 0
			return {
				etfType: row.etfType,
				label: row.label,
				minimumBuyShare: row.idealBuyMin,
				remainderShare,
				amount: row.idealBuyMin + remainderShare,
			}
		}),
	}
}

export function formatAdviceAllocationDiagnosticsBlock(params: {
	holdings: EtfEntry[]
	guidelines: EtfGuideline[]
	cashAmount: string
	cashCurrency: string
	catalog: CatalogEntry[]
}): string | null {
	const diagnostics = computeAdviceAllocationDiagnostics(params)
	if (!diagnostics) return null

	const { postTotal, currency, rows, sumIdealBuyMin, targetPctSum } =
		diagnostics
	const lines: string[] = [
		'---',
		'Server allocation diagnostics (authoritative numbers — interpret these in "Current state analysis" by referencing gaps, not restating the numbers; do not contradict):',
		'- **Buy-only:** these figures assume **no sales** — only the deployable cash is deployed; overweight buckets may stay above target until more cash is added.',
		`- Post-investment portfolio total used below: ${postTotal.toFixed(2)} ${currency} (holdings + deployable cash).`,
		`- Guideline target % per row are **sums by asset type** (instrument + bucket lines combined). Each row shows **normalized % of post-total** (= raw type sum ÷ total guideline sum × 100); raw sums are in parentheses when the line total ≠ 100%.`,
		'Per asset-class bucket: target % (normalized of post-total), current value, target value at post-total, minimum buy to reach target without selling (0 if already at/above target):',
	]

	for (const row of rows) {
		const normalizedPct = (row.targetPct / targetPctSum) * 100
		const targetPctLabel =
			Math.abs(targetPctSum - 100) < 0.000_001
				? `${normalizedPct.toFixed(2)}%`
				: `${normalizedPct.toFixed(2)}% (${row.targetPct}/${targetPctSum})`
		lines.push(
			`- ${row.label}: target ${targetPctLabel} → ${row.targetAmtPost.toFixed(2)} ${currency} at post-total; currently ${row.currentAmt.toFixed(2)} ${currency}; minimum buy (if underweight) ${row.idealBuyMin.toFixed(2)} ${currency}`,
		)
	}

	const cashNum = parseAdviceCashAmount(params.cashAmount) ?? 0
	const deployment = planAdviceCashDeployment({
		diagnostics,
		cashAmount: cashNum,
	})

	if (!deployment.coversAllMinimumBuys) {
		lines.push(
			`- Not enough cash to fully reach all targets with buys only: minimum buys sum to ${sumIdealBuyMin.toFixed(2)} ${currency} but deployable cash is ${cashNum.toFixed(2)} ${currency}.`,
			`- **Recommended deployment of this cash** (proportional to those minimum buys among underweight buckets; 0 where minimum buy is 0):`,
		)
		for (const row of deployment.rows) {
			lines.push(
				`  - ${row.label}: deploy ~${row.amount.toFixed(2)} ${currency}`,
			)
		}
	} else {
		lines.push(
			`- Minimum buys to hit targets sum to ${sumIdealBuyMin.toFixed(2)} ${currency} (≤ deployable ${cashNum.toFixed(2)} ${currency}).`,
		)
		if (deployment.remainder > CASH_DEPLOYMENT_EPSILON) {
			lines.push(
				`- After those minimum buys, remaining cash ${deployment.remainder.toFixed(2)} ${currency}: add across buckets in proportion to target % to preserve the mix.`,
			)
			for (const row of deployment.rows) {
				lines.push(
					`  - ${row.label}: +~${row.remainderShare.toFixed(2)} ${currency} from remainder`,
				)
			}
		}
	}

	lines.push(
		'Map these buckets to specific ETFs from the catalog (same asset type). etf_proposals row amounts should align with the deployment figures above.',
	)

	return lines.join('\n')
}

/** Server-side allocation summary so the model can mirror it in bullet form. */
export function formatAllocationContext(
	holdings: EtfEntry[],
	catalog: CatalogEntry[],
): string {
	if (holdings.length === 0) {
		return 'No ETF holdings recorded yet — this summary shows 0% in ETFs. Any deployable cash the user states separately is new money to allocate into ETFs, not an ETF holding total.'
	}
	const total = holdings.reduce((sum, holding) => sum + holding.value, 0)
	if (total <= 0) {
		return 'Holdings total is zero; cannot compute allocation percentages.'
	}
	const sums = new Map<string, number>()
	for (const holding of holdings) {
		const matchedEntry = findCatalogMatch(holding, catalog)
		const label = matchedEntry
			? formatEtfTypeLabel(matchedEntry.type)
			: 'unclassified (no catalog match for this holding)'
		sums.set(label, (sums.get(label) ?? 0) + holding.value)
	}
	const lines: string[] = [
		`Total ETF position value (sum of holding line items only; excludes any deployable cash the user states separately): ${total.toFixed(2)} (values as stored; mixed currencies may apply).`,
		'Approximate share by asset type (each holding mapped via catalog ticker/name when possible):',
	]
	for (const [label, bucketSum] of [...sums.entries()].sort(
		(a, b) => b[1] - a[1],
	)) {
		const pct = ((bucketSum / total) * 100).toFixed(1)
		lines.push(`- ${label}: ${pct}% (about ${bucketSum.toFixed(2)})`)
	}
	return lines.join('\n')
}

export function formatCatalogForAdvice(catalog: CatalogEntry[]): string {
	if (catalog.length === 0) {
		return 'No ETF catalog entries are available. Do not invent tickers or performance numbers; give only general asset-class guidance.'
	}
	return catalog
		.map((entry) => {
			const bits: string[] = [
				`id: ${entry.id}`,
				`${entry.ticker} — ${entry.name}`,
				`type: ${formatEtfTypeLabel(entry.type)}`,
			]
			if (entry.description) bits.push(`description: ${entry.description}`)
			if (typeof entry.rate_of_return === 'number') {
				bits.push(`annual rate of return: ${entry.rate_of_return}%`)
			}
			if (entry.return_risk) bits.push(`return/risk: ${entry.return_risk}`)
			if (entry.volatility) bits.push(`volatility: ${entry.volatility}`)
			if (entry.expense_ratio)
				bits.push(`expense ratio: ${entry.expense_ratio}`)
			if (entry.region) bits.push(`region: ${entry.region}`)
			if (entry.sector) bits.push(`sector: ${entry.sector}`)
			if (entry.fund_size) bits.push(`fund size: ${entry.fund_size}`)
			if (typeof entry.risk_kid === 'number')
				bits.push(`risk: ${entry.risk_kid}`)
			if (entry.esg !== undefined) bits.push(`ESG: ${entry.esg ? 'yes' : 'no'}`)
			return `- ${bits.join(' | ')}`
		})
		.join('\n')
}

function buildPortfolioReviewUserMessage(params: {
	holdings: EtfEntry[]
	guidelines: EtfGuideline[]
	catalog: CatalogEntry[]
}): string {
	const { holdings, guidelines, catalog } = params

	const holdingsList =
		holdings.length === 0
			? 'No ETFs recorded yet.'
			: holdings
					.map(
						(holding) =>
							`- ${holding.name}: ${holding.value} ${holding.currency}`,
					)
					.join('\n')

	const aggregatedBuckets = formatAggregatedGuidelineBucketsBlock(guidelines)
	const guidelinesSection =
		guidelines.length === 0
			? '**No target allocation guidelines were provided.** Base balance and improvement ideas on the holdings and catalog only; say when you are inferring without explicit targets.\n\n'
			: `My target allocation (intended long-term mix of my ETF portfolio; compare **current** holding weights to these targets):\n${guidelines.map(formatGuidelineLine).join('\n')}\n\n${aggregatedBuckets ? `${aggregatedBuckets}\n\n` : ''}`

	const allocationBlock = formatAllocationContext(holdings, catalog)
	const catalogBlock = formatCatalogForAdvice(catalog)

	return (
		`${guidelinesSection}` +
		`---\nAllocation context (current ETF weights by asset type; do not invent percentages beyond this summary):\n${allocationBlock}\n\n` +
		`---\nETF catalog (cite only tickers and stats from this list):\n${catalogBlock}\n\n` +
		`---\nMy current holdings (line items):\n${holdingsList}\n\n` +
		`Give the portfolio health review described in your system instructions. Respond using the JSON block structure there (paragraph blocks only; no etf_proposals).`
	)
}

export async function getInvestmentAdvice(params: {
	holdings: EtfEntry[]
	guidelines: EtfGuideline[]
	cashAmount: string
	cashCurrency: string
	catalog: CatalogEntry[]
	client: AdviceClient
	model?: AdviceModelId
	analysisMode?: AdviceAnalysisMode
}): Promise<AdviceDocument> {
	const {
		holdings,
		guidelines,
		cashAmount,
		cashCurrency,
		catalog,
		client,
		model = DEFAULT_ADVICE_MODEL,
		analysisMode = DEFAULT_ADVICE_ANALYSIS_MODE,
	} = params

	if (analysisMode === 'portfolio_review') {
		const userMessage = buildPortfolioReviewUserMessage({
			holdings,
			guidelines,
			catalog,
		})
		const response = await client.chat.completions.create({
			model,
			messages: [
				{ role: 'system', content: PORTFOLIO_REVIEW_SYSTEM_PROMPT },
				{ role: 'user', content: userMessage },
			],
			response_format: { type: 'json_object' },
		})
		const content = response.choices[0]?.message?.content ?? null
		return parseAdviceDocument(content)
	}

	const holdingsList =
		holdings.length === 0
			? 'No ETFs recorded yet.'
			: holdings
					.map(
						(holding) =>
							`- ${holding.name}: ${holding.value} ${holding.currency}`,
					)
					.join('\n')

	const aggregatedBuckets = formatAggregatedGuidelineBucketsBlock(guidelines)
	const guidelinesSection =
		guidelines.length === 0
			? ''
			: `My target allocation (each line is the **target share of my total ETF portfolio after** I invest the deployable cash below — i.e. (existing holdings + these purchases), **not** the split of the new cash alone):\n${guidelines.map(formatGuidelineLine).join('\n')}\n\n${aggregatedBuckets ? `${aggregatedBuckets}\n\n` : ''}`

	const guidelineCashObjective =
		guidelines.length > 0
			? 'Choose buys so **after** investing this cash, my **whole ETF portfolio** (holdings + buys) matches those targets as closely as **buy-only** allows (no selling); show approximate post-purchase % vs each target.\n\n'
			: ''

	const allocationBlock = formatAllocationContext(holdings, catalog)
	const catalogBlock = formatCatalogForAdvice(catalog)
	const arithmeticBlock = formatPostInvestmentTotalsBlock({
		holdings,
		cashAmount,
		cashCurrency,
	})
	const diagnosticsBlock = formatAdviceAllocationDiagnosticsBlock({
		holdings,
		guidelines,
		cashAmount,
		cashCurrency,
		catalog,
	})

	const userMessage =
		`${guidelinesSection}` +
		`---\nAllocation context (use for "Current state analysis" bullets; do not invent percentages beyond this summary):\n${allocationBlock}\n\n` +
		`---\nETF catalog (recommend only tickers from this list; cite performance/cost from these lines):\n${catalogBlock}\n\n` +
		`---\nMy current holdings (line items):\n${holdingsList}\n\n` +
		`---\nDeployable cash — new money to put into ETFs only (not included in the ETF totals above):\n${cashAmount} ${cashCurrency}\n\n` +
		`${arithmeticBlock}\n\n` +
		`${diagnosticsBlock ? `${diagnosticsBlock}\n\n` : ''}` +
		`${guidelineCashObjective}` +
		`${BUY_ONLY_USER_BLOCK}` +
		`Respond using the JSON block structure in your system instructions.`

	const response = await client.chat.completions.create({
		model,
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: userMessage },
		],
		response_format: { type: 'json_object' },
	})

	const content = response.choices[0]?.message?.content ?? null
	return parseAdviceDocument(content)
}
