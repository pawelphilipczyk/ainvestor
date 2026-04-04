import type { AdviceClient } from '../advice/advice-client.ts'
import type { AdviceModelId } from '../advice/advice-openai.ts'
import {
	DEFAULT_ADVICE_MODEL,
	formatCatalogForAdvice,
} from '../advice/advice-openai.ts'
import { sanitizeCatalogLineFragmentForEtfDetailPrompt } from './catalog-etf-openai-sanitize.ts'
import type { CatalogEntry } from './lib.ts'

const ETF_DETAIL_SYSTEM_PROMPT = `You are a financial educator explaining a single ETF to someone who is considering a purchase.

The user message is one catalog line for that fund. The catalog is the **only** authoritative source for numeric facts (returns, fees, risk scores, size, etc.). If the line is incomplete, say what is unknown and give **general** education about the asset class or typical ETF mechanics — do **not** invent specific performance, forecasts, or risk metrics.

Cover, in plain language and short sections (use ## headings and bullets where helpful):
1. **What it offers** — objective, index/strategy type, replication method if inferable from catalog/description.
2. **Where and what it invests** — geography, sectors, asset class; tie to catalog fields.
3. **Past performance** — cite **only** numbers from the catalog. If none, say the app does not provide historical return data here.
4. **Outlook** — do **not** claim precise forecasts. You may discuss **drivers and uncertainties** in educational terms only.
5. **Risks** — concentration, currency, credit, duration, tracking error, liquidity, regulatory/KID-style risk where catalog supports it; generic ETF risks if needed.

End with a one-line reminder that this is educational, not personalized investment advice, and that past performance does not guarantee future results.

Respond with **plain text only** (no JSON, no markdown code fences). You may use normal markdown headings and bullets in the text.`

export async function getCatalogEtfDeepDiveText(params: {
	entry: CatalogEntry
	client: AdviceClient
	model?: AdviceModelId
}): Promise<string> {
	const { entry, client, model = DEFAULT_ADVICE_MODEL } = params
	const catalogLine = sanitizeCatalogLineFragmentForEtfDetailPrompt(
		formatCatalogForAdvice([entry]),
	)
	const userMessage = `Catalog line for this fund (authoritative for numbers):\n${catalogLine}`

	const response = await client.chat.completions.create({
		model,
		messages: [
			{ role: 'system', content: ETF_DETAIL_SYSTEM_PROMPT },
			{ role: 'user', content: userMessage },
		],
	})

	const text = response.choices[0]?.message?.content?.trim()
	if (!text) {
		throw new Error('Empty ETF information response from model')
	}
	return text
}
