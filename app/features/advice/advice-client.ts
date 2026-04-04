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

let injectedClient: AdviceClient | null = null

/** Tests inject a mock; production uses OpenAI when unset. */
export function setAdviceClient(client: AdviceClient | null) {
	injectedClient = client
}

export function getOrCreateAdviceClient(): AdviceClient {
	return injectedClient ?? createAdviceClient()
}

export function createAdviceClient(): AdviceClient {
	return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}
