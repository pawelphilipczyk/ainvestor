import OpenAI from 'openai'
import type { EtfEntry } from './lib/gist.ts'
import type { EtfGuideline } from './lib/guidelines.ts'

export type { EtfEntry }

const SYSTEM_PROMPT = `You are a financial advisor specialising in ETF portfolio allocation.
The user may set a hybrid target allocation: asset-class buckets (e.g. a percentage for all equities)
and/or specific fund targets. When both exist, treat fund-level targets as refinements within or
alongside those buckets — note any overlap or tension and prioritise moving the portfolio toward
the stated targets without double-counting.
The user will describe their target allocation (if set), their current holdings, and available cash.
Compare the current holdings against the target allocation and recommend which ETF to buy next
to move the portfolio closest to the stated targets — prioritising the asset furthest below its target percentage.
If no target allocation is set, recommend based on diversification, risk balance, and long-term growth.
Keep your answer concise – two to four paragraphs maximum.
Do not provide legal or tax advice; only portfolio allocation guidance.`

export function formatGuidelineLine(g: EtfGuideline): string {
	if (g.kind === 'asset_class') {
		return `- Asset class ${g.etfType.replace('_', ' ')}: ${g.targetPct}% (bucket)`
	}
	return `- ${g.etfName} (${g.etfType}): ${g.targetPct}% (specific fund)`
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

export async function getInvestmentAdvice(
	holdings: EtfEntry[],
	guidelines: EtfGuideline[],
	cashAmount: string,
	client: AdviceClient,
): Promise<string> {
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
	})

	return response.choices[0]?.message?.content ?? 'No advice available.'
}
