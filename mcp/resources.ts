/**
 * The three datasets, addressable as MCP resources.
 *
 * Same JSON as the matching tools, by design: a resource is not a second
 * rendering of the data but the same one under a URI, so a client that attaches
 * `ainvestor://portfolio` to a conversation and a client that calls
 * `get_portfolio` reason about identical text.
 */
import { fetchCatalog } from '../app/features/catalog/lib.ts'
import type { GistCredentials } from './data-gist.ts'
import { resolveDataGistId } from './data-gist.ts'
import {
	fetchEtfsCached,
	fetchGuidelinesOrThrowCached,
} from './private-gist-cache.ts'
import type { McpResourceDefinition } from './protocol.ts'
import { summarizeWholeCatalog } from './tools/catalog.ts'
import { summarizeGuidelines } from './tools/guidelines.ts'
import { summarizePortfolio } from './tools/portfolio.ts'

const MIME_TYPE = 'application/json'

function jsonText(payload: unknown): string {
	return JSON.stringify(payload, null, 2)
}

export function createAinvestorResources(
	credentials: GistCredentials,
): McpResourceDefinition[] {
	return [
		{
			uri: 'ainvestor://portfolio',
			name: 'portfolio',
			title: 'Portfolio holdings',
			description:
				"The user's holdings with their values and currencies, the portfolio total, and each holding's share of it. Same content as the get_portfolio tool.",
			mimeType: MIME_TYPE,
			read: async () => {
				const gistId = await resolveDataGistId(credentials)
				const entries = await fetchEtfsCached(credentials.githubToken, gistId)
				return jsonText(summarizePortfolio(entries))
			},
		},
		{
			uri: 'ainvestor://guidelines',
			name: 'guidelines',
			title: 'Target allocation',
			description:
				"The user's guideline rows, the sum of their targets, and the effective target per asset class. Same content as the get_guidelines tool.",
			mimeType: MIME_TYPE,
			read: async () => {
				const gistId = await resolveDataGistId(credentials)
				const guidelines = await fetchGuidelinesOrThrowCached(
					credentials.githubToken,
					gistId,
				)
				return jsonText(summarizeGuidelines(guidelines))
			},
		},
		{
			uri: 'ainvestor://catalog',
			name: 'catalog',
			title: 'Shared fund catalog',
			description:
				'Every fund in the shared catalog as a compact row — the only source of valid tickers. The list_catalog tool searches the same data; get_catalog_entry returns one row in full.',
			mimeType: MIME_TYPE,
			read: async () => jsonText(summarizeWholeCatalog(await fetchCatalog())),
		},
	]
}
