import OpenAI from 'openai'
import {
	type AdviceDocument,
	parseAdviceDocument,
} from './features/advice/advice-document.ts'
import type { EtfEntry } from './lib/gist.ts'
import type { EtfGuideline } from './lib/guidelines.ts'
import { formatEtfTypeLabel } from './lib/guidelines.ts'

export type { AdviceDocument, EtfEntry }

const SYSTEM_PROMPT = `You are a financial advisor specialising in ETF portfolio allocation.
The user may set a hybrid target allocation: asset-class buckets (e.g. a percentage for all equities)
and/or specific fund targets. When both exist, treat fund-level targets as refinements within or
alongside those buckets — note any overlap or tension and prioritise moving the portfolio toward
the stated targets without double-counting.
The user will describe their target allocation (if set), their current holdings, and available cash.
Compare the current holdings against the target allocation and recommend which ETF to buy next
to move the portfolio closest to the stated targets — prioritising the asset furthest below its target percentage.
If no target allocation is set, recommend based on diversification, risk balance, and long-term growth.
Keep written guidance concise (roughly two to four short paragraphs total across paragraph blocks).
Do not provide legal or tax advice; only portfolio allocation guidance.

You MUST respond with a single JSON object only (no markdown code fences, no extra text). Shape:
{
  "blocks": [
    { "type": "paragraph", "text": "..." },
    { "type": "etf_proposals", "caption": "optional short heading", "rows": [
      { "name": "Fund name", "ticker": "VTI", "amountUsd": 500, "note": "optional rationale" }
    ]}
  ]
}
Rules:
- Include at least one block. Use "paragraph" for narrative and optional "etf_proposals" for a proposed purchases table.
- "etf_proposals.rows" may be empty if a table is not needed.
- "amountUsd" is optional; omit or use null when not giving a dollar amount.
- Use plain text in "text" and "note" fields (no HTML tags).`

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

export async function getInvestmentAdvice(
	holdings: EtfEntry[],
	guidelines: EtfGuideline[],
	cashAmount: string,
	client: AdviceClient,
): Promise<AdviceDocument> {
	const holdingsList =
		holdings.length === 0
			? 'No ETFs recorded yet.'
			: holdings.map((h) => `- ${h.name}: ${h.value} ${h.currency}`).join('\n')

	const guidelinesSection =
		guidelines.length === 0
			? ''
			: `My target allocation:\n${guidelines.map(formatGuidelineLine).join('\n')}\n\n`

	const userMessage =
		`${guidelinesSection}` +
		`My current holdings:\n${holdingsList}\n\n` +
		`I have $${cashAmount} available to invest. What should I buy next?`

	const response = await client.chat.completions.create({
		model: 'gpt-4o-mini',
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: userMessage },
		],
		response_format: { type: 'json_object' },
	})

	const content = response.choices[0]?.message?.content
	return parseAdviceDocument(content)
}
