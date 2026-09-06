import type { GistCredentials } from './data-gist.ts'
import type { McpServerInfo } from './protocol.ts'
import { createMcpServer } from './protocol.ts'
import { createGetPortfolioTool } from './tools/portfolio.ts'

export const SERVER_INFO: McpServerInfo = {
	name: 'ainvestor',
	version: '0.1.0',
}

export const INSTRUCTIONS = `Read-only access to the user's AI Investor data, stored in their own private GitHub gist.

The data model has no time dimension: holdings carry a monetary value but no quantity, price, or date, and there is no transaction history. Do not infer returns, performance, or purchase timing from it.`

/**
 * The tool surface, bound to one user's credentials. Shared by both transports
 * so stdio and HTTP can never drift on what they expose.
 */
export function createAinvestorMcpServer(credentials: GistCredentials) {
	return createMcpServer({
		serverInfo: SERVER_INFO,
		instructions: INSTRUCTIONS,
		tools: [createGetPortfolioTool(credentials)],
	})
}
