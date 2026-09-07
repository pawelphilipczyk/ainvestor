import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { CatalogEntry } from '../app/features/catalog/lib.ts'
import {
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../app/features/catalog/lib.ts'
import type { EtfEntry } from '../app/lib/gist.ts'
import { GIST_FILENAME } from '../app/lib/gist.ts'
import type { EtfGuideline } from '../app/lib/guidelines.ts'
import { GUIDELINES_FILENAME } from '../app/lib/guidelines.ts'
import { createAinvestorMcpServer } from './ainvestor-server.ts'
import type { GistCredentials } from './data-gist.ts'
import { resetDataGistIdCache } from './data-gist.ts'
import { createAinvestorResources } from './resources.ts'

const credentials: GistCredentials = {
	githubToken: 'token-value',
	dataGistId: 'pinned-gist',
}

const HOLDINGS: EtfEntry[] = [
	{ id: 'a', name: 'VWCE', ticker: 'VWCE', value: 3000, currency: 'PLN' },
	{ id: 'b', name: 'AGGH', ticker: 'AGGH', value: 1000, currency: 'PLN' },
]

const GUIDELINES: EtfGuideline[] = [
	{
		id: 'g1',
		kind: 'asset_class',
		etfName: '',
		etfType: 'equity',
		targetPct: 60,
	},
	{
		id: 'g2',
		kind: 'asset_class',
		etfName: '',
		etfType: 'bond',
		targetPct: 40,
	},
]

function catalogEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
	return {
		id: 't:VWCE',
		ticker: 'VWCE',
		name: 'Vanguard FTSE All-World',
		type: 'equity',
		description: 'Akcje globalne',
		...overrides,
	}
}

const originalFetch = globalThis.fetch

/** Serve the one private gist both datasets live in. */
function stubGist(): void {
	globalThis.fetch = async () =>
		Response.json({
			files: {
				[GIST_FILENAME]: { content: JSON.stringify(HOLDINGS) },
				[GUIDELINES_FILENAME]: { content: JSON.stringify(GUIDELINES) },
			},
		})
}

afterEach(() => {
	globalThis.fetch = originalFetch
	resetDataGistIdCache()
	resetSharedCatalogForTests()
})

function resourceByUri(uri: string) {
	const resource = createAinvestorResources(credentials).find(
		(candidate) => candidate.uri === uri,
	)
	assert.ok(resource, `no resource for ${uri}`)
	return resource
}

async function readResource(uri: string): Promise<Record<string, unknown>> {
	return JSON.parse(await resourceByUri(uri).read()) as Record<string, unknown>
}

describe('ainvestor resources', () => {
	it('serves the portfolio exactly as get_portfolio does', async () => {
		stubGist()

		const payload = await readResource('ainvestor://portfolio')

		assert.equal(payload.holdingCount, 2)
		assert.equal(payload.totalValue, 4000)
		assert.deepEqual(
			(payload.holdings as { sharePct: number }[]).map(
				(holding) => holding.sharePct,
			),
			[75, 25],
		)
	})

	it('serves the guidelines with their aggregated buckets', async () => {
		stubGist()

		const payload = await readResource('ainvestor://guidelines')

		assert.equal(payload.guidelineCount, 2)
		assert.equal(payload.totalTargetPct, 100)
		assert.deepEqual(payload.byAssetClass, [
			{ etfType: 'equity', targetPct: 60 },
			{ etfType: 'bond', targetPct: 40 },
		])
	})

	it('serves the whole catalog, untruncated', async () => {
		// list_catalog stops at its row limit; a client reading the resource asked
		// for the dataset, so a short answer would be a wrong one.
		const catalog = Array.from({ length: 120 }, (_unused, index) =>
			catalogEntry({ id: `t:F${index}`, ticker: `F${index}` }),
		)
		setSharedCatalogForTests({ entries: catalog, ownerLogin: 'catalog-owner' })

		const payload = await readResource('ainvestor://catalog')

		assert.equal(payload.catalogSize, 120)
		assert.equal(payload.returned, 120)
		assert.equal(payload.truncated, false)
		assert.equal((payload.entries as unknown[]).length, 120)
	})

	it('reports an empty catalog without claiming it was cut short', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: 'catalog-owner' })

		const payload = await readResource('ainvestor://catalog')

		assert.equal(payload.catalogSize, 0)
		assert.equal(payload.truncated, false)
		assert.deepEqual(payload.entries, [])
		// An unconfigured gist, a rejected read and a timeout all arrive as no
		// rows, so an empty list must not read as "the app knows no funds".
		assert.match(
			String(payload.note),
			/not configured or temporarily unreachable/,
		)
	})

	it('lets a rejected gist read fail instead of reporting an empty portfolio', async () => {
		globalThis.fetch = async () => new Response('nope', { status: 401 })
		await assert.rejects(resourceByUri('ainvestor://guidelines').read(), /401/)
	})

	it('exposes the same three resources over both transports', async () => {
		for (const allowLocalFileTools of [true, false]) {
			const server = createAinvestorMcpServer({
				credentials,
				allowLocalFileTools,
			})
			const response = (await server.handleMessage({
				jsonrpc: '2.0',
				id: 1,
				method: 'resources/list',
			})) as unknown as { result: { resources: { uri: string }[] } }
			assert.deepEqual(
				response.result.resources.map((resource) => resource.uri),
				[
					'ainvestor://portfolio',
					'ainvestor://guidelines',
					'ainvestor://catalog',
				],
			)
		}
	})
})
