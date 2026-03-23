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

**When the user provided target allocation percentages, that mix is the end state to optimise for.**
Your recommendations must **close the gap** to those targets: reason with numbers (current weights vs
target, which buckets or named funds are underweight). Allocate the full deployable cash across buys
that **maximise alignment** with the guidelines—prioritise the largest shortfalls first, split cash
across multiple buys when needed, and aim for the **tightest fit** the cash allows (state approximate
post-purchase weights or remaining gap in bullets when helpful). Do not settle for vague "diversification"
if targets are explicit. Hybrid rules: asset-class buckets plus specific fund lines—resolve overlap,
no double-counting.

**When there are no targets**, suggest prudent deployment from the catalog consistent with holdings.

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
- Mirror the allocation context (by asset type). **If targets exist:** quantify under/over-weight vs
  each target (percent points or amounts) so the reader sees exactly what the cash deployment fixes.
- Roughly 4–12 bullets.

## Next best picks
- At most 3 numbered picks (1. 2. 3.). Each starts with \`TICKER — Full fund name\` from the catalog.
  Empty catalog → asset-class only, no invented tickers.
- One line under each: why this buy **closes a target gap** (or, without targets, why it fits holdings).
  Cite catalog stats when relevant.
- Prefer adds to held tickers when that hits a target; otherwise new catalog funds. Order by impact on
  guideline alignment.

**etf_proposals (use when targets or cash deployment should be concrete):** rows should **fully deploy**
the user's cash (same currency; say so if FX mixing forces approximation). Amounts are **this deposit
only**, not a whole-portfolio rebalance. Sum of row amounts ≈ deployable cash unless you explain rounding.

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
			: `My target allocation (this is the mix to optimise toward for the whole portfolio):\n${guidelines.map(formatGuidelineLine).join('\n')}\n\n`

	const guidelineCashObjective =
		guidelines.length > 0
			? 'Deploy this cash across buys that **minimise gap to the target allocation**—largest shortfalls first, split the cash when several targets are underweight; state how each buy moves current % toward target.\n\n'
			: ''

	const allocationBlock = formatAllocationContext(holdings, catalog)
	const catalogBlock = formatCatalogForAdvice(catalog)

	const userMessage =
		`${guidelinesSection}` +
		`---\nAllocation context (use for "Current state analysis" bullets; do not invent percentages beyond this summary):\n${allocationBlock}\n\n` +
		`---\nETF catalog (recommend only tickers from this list; cite performance/cost from these lines):\n${catalogBlock}\n\n` +
		`---\nMy current holdings (line items):\n${holdingsList}\n\n` +
		`---\nDeployable cash — new money to put into ETFs only (not included in the ETF totals above):\n${cashAmount} ${cashCurrency}\n\n` +
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
