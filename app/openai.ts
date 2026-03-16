import OpenAI from 'openai'
import type { EtfEntry } from './lib/gist.ts'
import type { EtfGuideline } from './lib/guidelines.ts'

export type { EtfEntry }

const SYSTEM_PROMPT = `You are a financial advisor specialising in ETF portfolio allocation.
The user will describe their target allocation (if set), their current holdings, and available cash.
Compare the current holdings against the target allocation and recommend which ETF to buy next
to move the portfolio closest to the stated targets — prioritising the asset furthest below its target percentage.
If no target allocation is set, recommend based on diversification, risk balance, and long-term growth.
Keep your answer concise – two to four paragraphs maximum.
Do not provide legal or tax advice; only portfolio allocation guidance.`

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
			: `My target allocation:\n${guidelines.map((g) => `- ${g.etfName} (${g.etfType}): ${g.targetPct}%`).join('\n')}\n\n`

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
