import OpenAI from 'openai'
import type { CatalogEntry } from './features/catalog/lib.ts'
import type { EtfEntry } from './lib/gist.ts'
import type { EtfGuideline } from './lib/guidelines.ts'
import { formatEtfTypeLabel } from './lib/guidelines.ts'

export type { EtfEntry }

const SYSTEM_PROMPT = `You are a financial advisor specialising in ETF portfolio allocation.
The user may set a hybrid target allocation: asset-class buckets (e.g. a percentage for all equities)
and/or specific fund targets. When both exist, treat fund-level targets as refinements within or
alongside those buckets — note any overlap or tension and prioritise moving the portfolio toward
the stated targets without double-counting.

You receive: target allocation (if any), a numeric allocation summary by asset type, the full ETF
catalog with performance and cost fields, current holdings, and available cash. Base every specific
ETF recommendation on the catalog data provided. When you cite performance, risk, or cost, use
only values present in that catalog — do not invent figures.

Use these exact top-level Markdown section headings (in this order):

## Current state analysis

- Write **only bullet points** in this section (no narrative paragraphs).
- Describe the user's **current allocation by asset type** (equities, bonds, real estate, commodities,
  mixed, money market), using percentages and amounts consistent with the allocation context supplied.
- If targets exist, add bullets that say which buckets or specific funds are **over- or under-weight**
  relative to those targets.
- Aim for roughly **4–12 bullets** total.

## Next best picks to buy

- Give **at most 3** numbered picks (1. 2. 3.).
- Each pick must start with a line **\`TICKER — Full fund name\`** using tickers that appear in the
  ETF catalog in the user's message. If the catalog is empty, explain that no specific ETFs can be
  named and stay at asset-class level only.
- Under each ticker line, one short paragraph (or a few short sentences) explaining **why** this buy
  helps (rebalancing toward guidelines, diversification, filling a gap). **Mention relevant catalog
  performance data** for that fund (e.g. annual rate of return, return/risk, volatility, expense ratio)
  when those fields exist in the catalog.
- **At least one** pick should often be **adding to a fund the user already holds** when that move
  clearly restores balance toward the investment guidelines; the remaining pick(s) may be **new
  ETFs from the catalog** that address the same gap if the user does not yet own a suitable name.
- Order picks by impact: what moves the portfolio closest to targets / best diversification first.

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
		return 'No ETF holdings recorded yet — portfolio invested allocation is 0% (100% cash until you add positions).'
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
		`Total portfolio value (sum of holding values): ${total.toFixed(2)} (values as stored; mixed currencies may apply).`,
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

export async function getInvestmentAdvice(
	holdings: EtfEntry[],
	guidelines: EtfGuideline[],
	cashAmount: string,
	client: AdviceClient,
	catalog: CatalogEntry[],
): Promise<string> {
	const holdingsList =
		holdings.length === 0
			? 'No ETFs recorded yet.'
			: holdings.map((h) => `- ${h.name}: ${h.value} ${h.currency}`).join('\n')

	const guidelinesSection =
		guidelines.length === 0
			? ''
			: `My target allocation:\n${guidelines.map(formatGuidelineLine).join('\n')}\n\n`

	const allocationBlock = formatAllocationContext(holdings, catalog)
	const catalogBlock = formatCatalogForAdvice(catalog)

	const userMessage =
		`${guidelinesSection}` +
		`---\nAllocation context (use for "Current state analysis" bullets; do not invent percentages beyond this summary):\n${allocationBlock}\n\n` +
		`---\nETF catalog (recommend only tickers from this list; cite performance/cost from these lines):\n${catalogBlock}\n\n` +
		`---\nMy current holdings (line items):\n${holdingsList}\n\n` +
		`I have $${cashAmount} available to invest. Follow the response structure in your system instructions.`

	const response = await client.chat.completions.create({
		model: 'gpt-4o-mini',
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: userMessage },
		],
	})

	return response.choices[0]?.message?.content ?? 'No advice available.'
}
