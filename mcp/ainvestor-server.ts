import type { GistCredentials } from './data-gist.ts'
import type { McpServerInfo } from './protocol.ts'
import { createMcpServer } from './protocol.ts'
import {
	createDeleteCatalogEntryTool,
	createGetCatalogEntryTool,
	createListCatalogTool,
	createUpsertCatalogEntryTool,
} from './tools/catalog.ts'
import { createImportCatalogFromBankFileTool } from './tools/catalog-import.ts'
import {
	createDeleteGuidelineTool,
	createGetGuidelinesTool,
	createSetGuidelineTool,
} from './tools/guidelines.ts'
import { createGetPortfolioTool } from './tools/portfolio.ts'

export const SERVER_INFO: McpServerInfo = {
	name: 'ainvestor',
	version: '0.3.0',
}

export const INSTRUCTIONS = `Access to the user's AI Investor data, stored in their own private GitHub gist.

The data model has no time dimension: holdings carry a monetary value but no quantity, price, or date, and there is no transaction history. Do not infer returns, performance, or purchase timing from it.

Guidelines are the user's target allocation, in percent of the whole portfolio. Read them with get_guidelines before advising on what to buy, and never fold a named-fund target on top of its own asset-class target — get_guidelines reports the aggregated buckets to use instead.

Guidelines can be edited: set_guideline creates or updates one row, delete_guideline removes one. Holdings stay read-only — buying and selling belongs in the web app.

The catalog is the shared list of funds this app knows about, and the only source of valid tickers: never propose a fund that list_catalog does not return, because the user may not be able to buy it. Unlike the portfolio and the guidelines, the catalog is one public gist shared by every user, and only its owner can change it.`

/**
 * The tool surface, bound to one user's credentials. Shared by both transports
 * so stdio and HTTP cannot drift on what they expose.
 *
 * `allowLocalFileTools` is the one sanctioned exception: a tool that reads a
 * path on the caller's own machine is meaningless over HTTP, where the server
 * runs on a different computer entirely. stdio passes true, HTTP false, and
 * nothing else may vary between the two.
 */
export function createAinvestorMcpServer(params: {
	credentials: GistCredentials
	allowLocalFileTools: boolean
}) {
	const { credentials, allowLocalFileTools } = params
	return createMcpServer({
		serverInfo: SERVER_INFO,
		instructions: INSTRUCTIONS,
		tools: [
			createGetPortfolioTool(credentials),
			createGetGuidelinesTool(credentials),
			createSetGuidelineTool(credentials),
			createDeleteGuidelineTool(credentials),
			createListCatalogTool(),
			createGetCatalogEntryTool(),
			createUpsertCatalogEntryTool(credentials),
			createDeleteCatalogEntryTool(credentials),
			...(allowLocalFileTools
				? [createImportCatalogFromBankFileTool(credentials)]
				: []),
		],
	})
}
