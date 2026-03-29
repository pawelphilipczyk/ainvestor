import OpenAI from 'openai'

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
