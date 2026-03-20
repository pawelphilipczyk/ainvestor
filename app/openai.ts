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

const GUIDELINES_REVIEW_SYSTEM = `You review ETF target allocation guidelines. The user may set asset-class
buckets (broad category percentages) and/or specific fund targets. In a short response (one to three paragraphs),
comment on balance and diversification, whether percentages add up sensibly, and whether asset-class and
fund-level lines complement each other or conflict. Do not give legal or tax advice.`

let guidelinesAnalysisClient: AdviceClient | null = null

export function setGuidelinesAnalysisClient(client: AdviceClient | null) {
	guidelinesAnalysisClient = client
}

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

export async function getGuidelinesAnalysis(
	guidelines: EtfGuideline[],
	client: AdviceClient,
): Promise<string> {
	if (guidelines.length === 0) {
		return 'No guidelines are set yet. Add at least one target to get a review.'
	}

	const lines = guidelines.map(formatGuidelineLine).join('\n')
	const userMessage = `Here are my target allocation guidelines:\n${lines}\n\nBriefly review this mix.`

	const response = await client.chat.completions.create({
		model: 'gpt-4o-mini',
		messages: [
			{ role: 'system', content: GUIDELINES_REVIEW_SYSTEM },
			{ role: 'user', content: userMessage },
		],
	})

	return response.choices[0]?.message?.content ?? 'No analysis available.'
}

/** Uses the injectable analysis client when set (e.g. in tests). */
export async function getGuidelinesAnalysisWithDefault(
	guidelines: EtfGuideline[],
): Promise<string> {
	return getGuidelinesAnalysis(
		guidelines,
		guidelinesAnalysisClient ?? createDefaultClient(),
	)
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
