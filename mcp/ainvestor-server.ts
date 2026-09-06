import type { GistCredentials } from './data-gist.ts'
import type { McpServerInfo } from './protocol.ts'
import { createMcpServer } from './protocol.ts'
import {
	createDeleteGuidelineTool,
	createGetGuidelinesTool,
	createSetGuidelineTool,
} from './tools/guidelines.ts'
import { createGetPortfolioTool } from './tools/portfolio.ts'

export const SERVER_INFO: McpServerInfo = {
	name: 'ainvestor',
	version: '0.2.0',
}

const SHARED_INSTRUCTIONS = `Access to the user's AI Investor data, stored in their own private GitHub gist.

The data model has no time dimension: holdings carry a monetary value but no quantity, price, or date, and there is no transaction history. Do not infer returns, performance, or purchase timing from it.

Guidelines are the user's target allocation, in percent of the whole portfolio. Read them with get_guidelines before advising on what to buy, and never fold a named-fund target on top of its own asset-class target — get_guidelines reports the aggregated buckets to use instead.`

const READ_ONLY_INSTRUCTIONS = `${SHARED_INSTRUCTIONS}

This server is read-only: it cannot change holdings or guidelines. Ask the user to edit them in the web app.`

const WRITABLE_INSTRUCTIONS = `${SHARED_INSTRUCTIONS}

Guidelines can also be written: set_guideline creates or updates one row, delete_guideline removes one. Holdings stay read-only. A write replaces the whole guidelines file with what this call read a moment earlier, so avoid writing while the user is editing the same page in a browser.`

/** What `initialize` reports, so a client's system prompt matches the tools it got. */
export function instructionsFor(allowWrites: boolean): string {
	return allowWrites ? WRITABLE_INSTRUCTIONS : READ_ONLY_INSTRUCTIONS
}

/**
 * The tool surface, bound to one user's credentials. Shared by both transports
 * so stdio and HTTP can never drift on what they expose.
 *
 * `allowWrites` is not optional: each transport reads the flag itself, and a
 * default would let a new call site ship writes without deciding to.
 */
export function createAinvestorMcpServer(params: {
	credentials: GistCredentials
	allowWrites: boolean
}) {
	const { credentials, allowWrites } = params
	return createMcpServer({
		serverInfo: SERVER_INFO,
		instructions: instructionsFor(allowWrites),
		tools: [
			createGetPortfolioTool(credentials),
			createGetGuidelinesTool(credentials),
			// Absent from tools/list entirely when writes are off, so a model never
			// offers the user an edit the server would refuse.
			...(allowWrites
				? [
						createSetGuidelineTool(credentials),
						createDeleteGuidelineTool(credentials),
					]
				: []),
		],
	})
}
