import OpenAI from 'openai'
import {
	type AdviceDocument,
	parseAdviceDocument,
} from './features/advice/advice-document.ts'
import type { CatalogEntry } from './features/catalog/lib.ts'
import type { EtfEntry } from './lib/gist.ts'
import type { EtfGuideline } from './lib/guidelines.ts'
import { formatEtfTypeLabel } from './lib/guidelines.ts'

export type { AdviceDocument, EtfEntry }

const SYSTEM_PROMPT = `You are a financial advisor specialising in ETF portfolio allocation.

Inputs: target allocation (if any), ETF-only allocation summary, ETF catalog, current holdings,
**deployable cash** (amount and currency). Catalog is the only source for tickers and cited stats.

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
Prioritise the largest gaps in that **post-buy** picture. Hybrid rules: asset-class buckets plus
specific fund lines—resolve overlap, no double-counting.

**When there are no targets**, suggest prudent deployment from the catalog consistent with holdings.

If the user message contains **"Arithmetic for totals (authoritative"**, copy those figures exactly for
pre-investment holdings sum, deployable cash, and **post-investment total portfolio value** — do not
recalculate a different total (e.g. do not confuse target percentages with the portfolio denominator).
If it flags mixed currencies or unparsed cash, obey that constraint.

Base every specific ETF pick on the catalog; do not invent performance, risk, or cost figures.

You MUST respond with a single JSON object only (no markdown code fences, no extra text). Shape:
{
  "blocks": [
    { "type": "paragraph", "text": "..." },
    { "type": "etf_proposals", "caption": "optional short heading", "rows": [
      { "name": "Fund name", "ticker": "VTI", "amount": 500, "currency": "USD", "note": "optional rationale" }
    ]}
  ]
}

Cover this substance across your blocks (paragraph text can use headings and bullets inside the string):

## Current state analysis
- One paragraph block, bullet lines only ("- ").
- Mirror the allocation context (by asset type). **If targets exist:** show **before** (current ETF
  weights) and **after** your proposed buys: approximate **post-purchase whole-portfolio %** vs each
  target (not just how you split the cash). Quantify remaining gap if targets cannot be fully reached.
- Roughly 4–12 bullets.

## Next best picks
- At most 3 numbered picks (1. 2. 3.). Each starts with \`TICKER — Full fund name\` from the catalog.
  Empty catalog → asset-class only, no invented tickers.
- One line under each: why this buy **closes a target gap** (or, without targets, why it fits holdings).
  Cite catalog stats when relevant.
- Prefer adds to held tickers when that hits a target; otherwise new catalog funds. Order by impact on
  guideline alignment.

**etf_proposals (use when targets or cash deployment should be concrete):** rows should **fully deploy**
the user's cash (same currency; say so if FX mixing forces approximation). Sums are **only this inflow**
(no assumed sells); **justify** row sizes so **post-purchase total portfolio** (holdings + buys) best
matches the guideline %. Sum of row amounts ≈ deployable cash unless you explain rounding.

Rules:
- Include at least one block. Use "paragraph" for narrative and optional "etf_proposals" for rows.
- When targets exist, prefer a non-empty "etf_proposals" that deploys the cash; only omit the table if
  you truly cannot map buys to the catalog.
- "amount" and "currency" are optional for each row; when you suggest a purchase amount, include both
  "amount" (number) and "currency" (ISO code: PLN, USD, EUR, GBP, CHF, JPY, CAD, AUD, SEK, or NOK).
- Use plain text in "text" and "note" fields (no HTML tags).

Do not provide legal or tax advice; only portfolio allocation guidance.`

export function formatGuidelineLine(g: EtfGuideline): string {
	if (g.kind === 'asset_class') {
		return `- Asset class ${formatEtfTypeLabel(g.etfType)}: ${g.targetPct}% (bucket)`
	}
	return `- ${g.etfName} (${formatEtfTypeLabel(g.etfType)}): ${g.targetPct}% (specific fund)`
}

export type AdviceClient = {
	chat: {
		completions: {
			create: (params: {
				model: string
				messages: { role: 'system' | 'user'; content: string }[]
				response_format?: { type: 'json_object' }
			}) => Promise<{ choices: { message: { content: string | null } }[] }>
		}
	}
}

export function createDefaultClient(): AdviceClient {
	return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

/**
 * Parse user-entered deployable cash for advice arithmetic (totals in the prompt).
 * Accepts plain numbers, spaces, and common thousand/decimal separators.
 */
export function parseAdviceCashAmount(raw: string): number | null {
	const trimmed = raw.trim()
	if (!trimmed) return null
	const compact = trimmed.replace(/\s+/g, '')
	const hasComma = compact.includes(',')
	const hasDot = compact.includes('.')
	let normalized = compact
	if (hasComma && hasDot) {
		const lastComma = compact.lastIndexOf(',')
		const lastDot = compact.lastIndexOf('.')
		if (lastComma > lastDot) {
			normalized = compact.replace(/\./g, '').replace(',', '.')
		} else {
			normalized = compact.replace(/,/g, '')
		}
	} else if (hasComma && !hasDot) {
		const parts = compact.split(',')
		if (parts.length === 2 && parts[1].length <= 2 && parts[1].length > 0) {
			normalized = `${parts[0]}.${parts[1]}`
		} else {
			normalized = compact.replace(/,/g, '')
		}
	}
	const n = Number.parseFloat(normalized)
	if (!Number.isFinite(n) || n < 0) return null
	return n
}

function sumHoldingsValues(holdings: EtfEntry[]): {
	total: number
	currency: string | null
	mixed: boolean
} {
	if (holdings.length === 0) {
		return { total: 0, currency: null, mixed: false }
	}
	const firstCur = holdings[0].currency
	const mixed = holdings.some((h) => h.currency !== firstCur)
	if (mixed) {
		return { total: 0, currency: null, mixed: true }
	}
	const total = holdings.reduce((s, h) => s + h.value, 0)
	return { total, currency: firstCur, mixed: false }
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
		const post = cashNum
		lines.push(
			`- **After fully investing this deployable cash into ETFs, total ETF portfolio value = ${post.toFixed(2)} ${params.cashCurrency}** (all new money in this scenario).`,
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
	h: EtfEntry,
	catalog: CatalogEntry[],
): CatalogEntry | undefined {
	const fromTicker = h.ticker?.trim()
	if (fromTicker) {
		const u = fromTicker.toUpperCase()
		const hit = catalog.find((c) => c.ticker.toUpperCase() === u)
		if (hit) return hit
	}
	const name = h.name.trim()
	if (!name) return undefined
	const lower = name.toLowerCase()
	return catalog.find(
		(c) =>
			c.ticker.toUpperCase() === name.toUpperCase() ||
			c.name.toLowerCase() === lower,
	)
}

/** Server-side allocation summary so the model can mirror it in bullet form. */
export function formatAllocationContext(
	holdings: EtfEntry[],
	catalog: CatalogEntry[],
): string {
	if (holdings.length === 0) {
		return 'No ETF holdings recorded yet — this summary shows 0% in ETFs. Any deployable cash the user states separately is new money to allocate into ETFs, not an ETF holding total.'
	}
	const total = holdings.reduce((s, h) => s + h.value, 0)
	if (total <= 0) {
		return 'Holdings total is zero; cannot compute allocation percentages.'
	}
	const sums = new Map<string, number>()
	for (const h of holdings) {
		const c = findCatalogMatch(h, catalog)
		const label = c
			? formatEtfTypeLabel(c.type)
			: 'unclassified (no catalog match for this holding)'
		sums.set(label, (sums.get(label) ?? 0) + h.value)
	}
	const lines: string[] = [
		`Total ETF position value (sum of holding line items only; excludes any deployable cash the user states separately): ${total.toFixed(2)} (values as stored; mixed currencies may apply).`,
		'Approximate share by asset type (each holding mapped via catalog ticker/name when possible):',
	]
	for (const [label, sum] of [...sums.entries()].sort((a, b) => b[1] - a[1])) {
		const pct = ((sum / total) * 100).toFixed(1)
		lines.push(`- ${label}: ${pct}% (about ${sum.toFixed(2)})`)
	}
	return lines.join('\n')
}

export function formatCatalogForAdvice(catalog: CatalogEntry[]): string {
	if (catalog.length === 0) {
		return 'No ETF catalog entries are available. Do not invent tickers or performance numbers; give only general asset-class guidance.'
	}
	return catalog
		.map((e) => {
			const bits: string[] = [
				`${e.ticker} — ${e.name}`,
				`type: ${formatEtfTypeLabel(e.type)}`,
			]
			if (e.description) bits.push(`description: ${e.description}`)
			if (typeof e.rate_of_return === 'number') {
				bits.push(`annual rate of return: ${e.rate_of_return}%`)
			}
			if (e.return_risk) bits.push(`return/risk: ${e.return_risk}`)
			if (e.volatility) bits.push(`volatility: ${e.volatility}`)
			if (e.expense_ratio) bits.push(`expense ratio: ${e.expense_ratio}`)
			if (e.region) bits.push(`region: ${e.region}`)
			if (e.sector) bits.push(`sector: ${e.sector}`)
			if (e.fund_size) bits.push(`fund size: ${e.fund_size}`)
			if (typeof e.risk_kid === 'number')
				bits.push(`risk (KID 1–7): ${e.risk_kid}`)
			if (e.esg !== undefined) bits.push(`ESG: ${e.esg ? 'yes' : 'no'}`)
			return `- ${bits.join(' | ')}`
		})
		.join('\n')
}

export async function getInvestmentAdvice(params: {
	holdings: EtfEntry[]
	guidelines: EtfGuideline[]
	cashAmount: string
	cashCurrency: string
	catalog: CatalogEntry[]
	client: AdviceClient
}): Promise<AdviceDocument> {
	const { holdings, guidelines, cashAmount, cashCurrency, catalog, client } =
		params

	const holdingsList =
		holdings.length === 0
			? 'No ETFs recorded yet.'
			: holdings.map((h) => `- ${h.name}: ${h.value} ${h.currency}`).join('\n')

	const guidelinesSection =
		guidelines.length === 0
			? ''
			: `My target allocation (each line is the **target share of my total ETF portfolio after** I invest the deployable cash below — i.e. (existing holdings + these purchases), **not** the split of the new cash alone):\n${guidelines.map(formatGuidelineLine).join('\n')}\n\n`

	const guidelineCashObjective =
		guidelines.length > 0
			? 'Choose buys so **after** investing this cash, my **whole ETF portfolio** (holdings + buys) matches those targets as closely as possible; show approximate post-purchase % vs each target.\n\n'
			: ''

	const allocationBlock = formatAllocationContext(holdings, catalog)
	const catalogBlock = formatCatalogForAdvice(catalog)
	const arithmeticBlock = formatPostInvestmentTotalsBlock({
		holdings,
		cashAmount,
		cashCurrency,
	})

	const userMessage =
		`${guidelinesSection}` +
		`---\nAllocation context (use for "Current state analysis" bullets; do not invent percentages beyond this summary):\n${allocationBlock}\n\n` +
		`---\nETF catalog (recommend only tickers from this list; cite performance/cost from these lines):\n${catalogBlock}\n\n` +
		`---\nMy current holdings (line items):\n${holdingsList}\n\n` +
		`---\nDeployable cash — new money to put into ETFs only (not included in the ETF totals above):\n${cashAmount} ${cashCurrency}\n\n` +
		`${arithmeticBlock}\n\n` +
		`${guidelineCashObjective}` +
		`Respond using the JSON block structure in your system instructions.`

	const response = await client.chat.completions.create({
		model: 'gpt-4o-mini',
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: userMessage },
		],
		response_format: { type: 'json_object' },
	})

	const content = response.choices[0]?.message?.content ?? null
	return parseAdviceDocument(content)
}
