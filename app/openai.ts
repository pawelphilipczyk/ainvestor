import OpenAI from 'openai'

import type { EtfEntry } from './lib/gist.ts'

export type { EtfEntry }

const SYSTEM_PROMPT = `You are a financial advisor specialising in ETF portfolio allocation.
The user will tell you their current ETF holdings (name and current value in each currency) and how much cash they have available to invest.
Your job is to recommend which ETF they should buy next (or increase their position in) and why,
taking into account diversification, risk balance, and long-term growth.
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
  cashAmount: string,
  client: AdviceClient,
): Promise<string> {
  const holdingsList =
    holdings.length === 0
      ? 'No ETFs recorded yet.'
      : holdings
          .map(h => `- ${h.name}: ${h.value} ${h.currency}`)
          .join('\n')

  const userMessage = `My current ETF holdings:\n${holdingsList}\n\nI have $${cashAmount} available to invest. What should I buy next?`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  })

  return response.choices[0]?.message?.content ?? 'No advice available.'
}
