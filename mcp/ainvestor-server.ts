import type { GistCredentials } from './data-gist.ts'
import type { McpServerInfo } from './protocol.ts'
import { createMcpServer } from './protocol.ts'
import { createAinvestorResources } from './resources.ts'
import { createGetBuyPlanTool } from './tools/buy-plan.ts'
import {
	createDeleteCatalogEntryTool,
	createGetCatalogEntryTool,
	createListCatalogTool,
	createUpsertCatalogEntryTool,
} from './tools/catalog.ts'
import { createImportCatalogFromBankFileTool } from './tools/catalog-import.ts'
import { createGenerateAdviceTool } from './tools/generate-advice.ts'
import {
	createDeleteGuidelineTool,
	createGetGuidelinesTool,
	createSetGuidelineTool,
} from './tools/guidelines.ts'
import {
	createGetPortfolioTool,
	createRecordOperationTool,
	createRemoveHoldingTool,
} from './tools/portfolio.ts'
import { createGetSavedAdviceTool } from './tools/saved-advice.ts'

export const SERVER_INFO: McpServerInfo = {
	name: 'ainvestor',
	version: '0.7.0',
}

export const INSTRUCTIONS = `Access to the user's AI Investor data, stored in their own private GitHub gist.

The data model has no time dimension: holdings carry a monetary value but no quantity, price, or date, and there is no transaction history. Do not infer returns, performance, or purchase timing from it.

Guidelines are the user's target allocation, in percent of the whole portfolio. Read them with get_guidelines before advising on what to buy, and never fold a named-fund target on top of its own asset-class target — get_guidelines reports the aggregated buckets to use instead.

Guidelines can be edited: set_guideline creates or updates one row, delete_guideline removes one. Holdings can be edited too: record_operation buys or sells one holding by its catalog ticker, and remove_holding deletes one outright by id.

When asked where to put a sum of money, call get_buy_plan with that amount rather than working the gaps out from get_portfolio and get_guidelines by hand — it is the app's own arithmetic, the same figures the web app treats as authoritative. It answers with numbers, not fund picks: choose the funds yourself from list_catalog. It is buy-only: it assumes nothing is sold, so never turn its output into a recommendation to sell. It needs one currency throughout, and says so plainly when it cannot compute — report that reason instead of estimating the numbers yourself.

The catalog is the shared list of funds this app knows about, and the only source of valid tickers: never propose a fund that list_catalog does not return, because the user may not be able to buy it. Unlike the portfolio and the guidelines, the catalog is one public gist shared by every user, and only its owner can change it.

get_saved_advice returns the written analysis the web app's advice page last saved, in either of its two modes. It is a stored snapshot against the data of the moment it was written, and nothing here recomputes it: read its savedAt before repeating any figure from it, and take current numbers from the tools above. It costs nothing, so try it first. generate_advice writes a fresh one instead — it costs money, per call, so only reach for it when the user explicitly wants new written analysis rather than the stored one.

The portfolio, the guidelines and the catalog are also readable as the resources ainvestor://portfolio, ainvestor://guidelines and ainvestor://catalog. The first two carry exactly what get_portfolio and get_guidelines return; ainvestor://catalog carries every fund rather than one page of search results, so read it when you want the whole list and use list_catalog to search.`

/**
 * The tool surface, bound to one user's credentials. Shared by both transports
 * so stdio and HTTP cannot drift on what they expose; `allowLocalFileTools` is
 * the one sanctioned exception (decision D8 in docs/MCP_SERVER_PLAN.md).
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
			createRecordOperationTool(credentials),
			createRemoveHoldingTool(credentials),
			createGetBuyPlanTool(credentials),
			createGetSavedAdviceTool(credentials),
			createGenerateAdviceTool(credentials),
			createListCatalogTool(),
			createGetCatalogEntryTool(),
			createUpsertCatalogEntryTool(credentials),
			createDeleteCatalogEntryTool(credentials),
			...(allowLocalFileTools
				? [createImportCatalogFromBankFileTool(credentials)]
				: []),
		],
		resources: createAinvestorResources(credentials),
	})
}
