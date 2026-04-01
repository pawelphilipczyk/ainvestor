import type { CatalogEntry } from '../catalog/lib.ts'
import type { AdviceClient } from './advice-client.ts'
import type { AdviceModelId } from './advice-openai.ts'
import {
	DEFAULT_ADVICE_MODEL,
	formatCatalogForAdvice,
} from './advice-openai.ts'

const ETF_INFO_SYSTEM_PROMPT = `You are a financial educator explaining a single ETF to someone who is considering a purchase.

The user message includes the fund name, optional ticker, and the app's ETF catalog excerpt for that fund (if matched). The catalog is the **only** authoritative source for numeric facts (returns, fees, risk scores, size, etc.). If the catalog line is missing or incomplete, say what is unknown and give **general** education about the asset class or typical ETF mechanics — do **not** invent specific performance, forecasts, or risk metrics.

Cover, in plain language and short sections (use ## headings and bullets where helpful):
1. **What it offers** — objective, index/strategy type, replication method if inferable from catalog/description.
2. **Where and what it invests** — geography, sectors, asset class; tie to catalog fields.
3. **Past performance** — cite **only** numbers from the catalog (e.g. stated historical return fields). If none, say the app does not provide historical return data here and avoid fabricating figures.
4. **Outlook / predictions** — do **not** claim precise forecasts. You may discuss **drivers and uncertainties** (rates, markets, concentration) in educational terms only.
5. **Risks** — concentration, currency, credit, duration, tracking error, liquidity, regulatory/KID-style risk where catalog supports it; generic ETF risks if needed.

End with a one-line reminder that this is educational, not personalized investment advice, and that past performance does not guarantee future results.

Respond with **plain text only** (no JSON, no markdown code fences). You may use normal markdown headings and bullets in the text.`

function findCatalogEntryForProposal(params: {
	name: string
	ticker: string | undefined
	catalog: CatalogEntry[]
}): CatalogEntry | undefined {
	const { name, ticker, catalog } = params
	if (ticker) {
		const upper = ticker.trim().toUpperCase()
		const byTicker = catalog.find(
			(entry) => entry.ticker.toUpperCase() === upper,
		)
		if (byTicker) return byTicker
	}
	const trimmedName = name.trim()
	if (!trimmedName) return undefined
	const lower = trimmedName.toLowerCase()
	return catalog.find((entry) => entry.name.toLowerCase() === lower)
}

export async function getEtfDeepDiveText(params: {
	name: string
	ticker: string | undefined
	catalog: CatalogEntry[]
	client: AdviceClient
	model?: AdviceModelId
}): Promise<string> {
	const { name, ticker, catalog, client, model = DEFAULT_ADVICE_MODEL } = params

	const entry = findCatalogEntryForProposal({ name, ticker, catalog })
	const catalogLine = entry
		? formatCatalogForAdvice([entry])
		: 'No matching catalog row for this name/ticker — describe only in general terms and do not invent fund-specific stats.'

	const userMessage =
		`Fund name: ${name}\n` +
		`Ticker (if known): ${ticker ?? '(not provided)'}\n\n` +
		`---\nCatalog line for this fund (authoritative for numbers):\n${catalogLine}`

	const response = await client.chat.completions.create({
		model,
		messages: [
			{ role: 'system', content: ETF_INFO_SYSTEM_PROMPT },
			{ role: 'user', content: userMessage },
		],
	})

	const text = response.choices[0]?.message?.content?.trim()
	if (!text) {
		throw new Error('Empty ETF information response from model')
	}
	return text
}
