import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../../app/features/catalog/lib.ts'
import type { EtfGuideline } from '../../app/lib/guidelines.ts'
import { GUIDELINES_FILENAME } from '../../app/lib/guidelines.ts'
import type { GistCredentials } from '../data-gist.ts'
import { resetDataGistIdCache } from '../data-gist.ts'
import {
	createDeleteGuidelineTool,
	createGetGuidelinesTool,
	createSetGuidelineTool,
	summarizeGuidelines,
} from './guidelines.ts'

const credentials: GistCredentials = {
	githubToken: 'token-value',
	dataGistId: 'pinned-gist',
}

function guideline(overrides: Partial<EtfGuideline> = {}): EtfGuideline {
	return {
		id: 'a',
		kind: 'asset_class',
		etfName: '',
		targetPct: 40,
		etfType: 'equity',
		...overrides,
	}
}

type GistExchange = {
	/** Bodies of every PATCH the tool sent, parsed back into guideline rows. */
	saved: EtfGuideline[][]
	requests: { method: string; url: string }[]
}

/** Serve one guidelines gist, recording the writes the tool performs against it. */
function stubGist(rows: EtfGuideline[], saveStatus = 200): GistExchange {
	const exchange: GistExchange = { saved: [], requests: [] }
	globalThis.fetch = async (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	) => {
		const method = init?.method ?? 'GET'
		exchange.requests.push({ method, url: String(input) })
		if (method === 'PATCH') {
			const body = JSON.parse(String(init?.body)) as {
				files: Record<string, { content: string }>
			}
			exchange.saved.push(
				JSON.parse(body.files[GUIDELINES_FILENAME].content) as EtfGuideline[],
			)
			return new Response(null, { status: saveStatus })
		}
		return Response.json({
			files: { [GUIDELINES_FILENAME]: { content: JSON.stringify(rows) } },
		})
	}
	return exchange
}

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	resetDataGistIdCache()
	resetSharedCatalogForTests()
})

/** Payload of a tool result, which is always one JSON text block. */
function payloadOf(result: { content: { text: string }[] }) {
	return JSON.parse(result.content[0].text) as ReturnType<
		typeof summarizeGuidelines
	> & {
		action?: string
		warning?: string
		guideline?: { id: string; targetPct: number; etfType: string }
		deleted?: { id: string }
	}
}

function stubCatalog() {
	setSharedCatalogForTests({
		entries: [
			{
				id: 'catalog-1',
				ticker: 'VWCE',
				name: 'Vanguard FTSE All-World',
				type: 'equity',
				description: '',
			},
			{
				id: 'catalog-2',
				ticker: 'AGGH',
				name: 'iShares Core Global Aggregate Bond',
				type: 'bond',
				description: '',
			},
		],
		ownerLogin: 'owner',
	})
}

describe('summarizeGuidelines', () => {
	it('says plainly when no targets are set', () => {
		const summary = summarizeGuidelines([])
		assert.equal(summary.guidelineCount, 0)
		assert.equal(summary.totalTargetPct, 0)
		assert.deepEqual(summary.byAssetClass, [])
		assert.match(summary.note, /No guidelines are set/)
	})

	it('folds an instrument row into its own asset class rather than listing it apart', () => {
		const summary = summarizeGuidelines([
			guideline({
				id: 'a',
				kind: 'asset_class',
				etfType: 'equity',
				targetPct: 40,
			}),
			guideline({
				id: 'b',
				kind: 'instrument',
				etfName: 'VWCE',
				etfType: 'equity',
				targetPct: 20,
			}),
			guideline({
				id: 'c',
				kind: 'asset_class',
				etfType: 'bond',
				targetPct: 30,
			}),
		])
		assert.deepEqual(summary.byAssetClass, [
			{ etfType: 'equity', targetPct: 60 },
			{ etfType: 'bond', targetPct: 30 },
		])
		assert.equal(summary.totalTargetPct, 90)
		assert.equal(summary.unallocatedPct, 10)
		assert.equal(summary.exceedsCap, false)
	})

	it('reports a total above 100 instead of hiding it', () => {
		const summary = summarizeGuidelines([
			guideline({ id: 'a', targetPct: 70 }),
			guideline({ id: 'b', etfType: 'bond', targetPct: 45 }),
		])
		assert.equal(summary.totalTargetPct, 115)
		assert.equal(summary.exceedsCap, true)
		assert.equal(summary.unallocatedPct, -15)
	})

	it('carries the ticker only on instrument rows', () => {
		const summary = summarizeGuidelines([
			guideline({ id: 'a' }),
			guideline({ id: 'b', kind: 'instrument', etfName: 'VWCE' }),
		])
		assert.equal('ticker' in summary.guidelines[0], false)
		assert.equal(summary.guidelines[1].ticker, 'VWCE')
	})
})

describe('get_guidelines tool', () => {
	it('takes no arguments and explains the bucket folding', () => {
		const tool = createGetGuidelinesTool(credentials)
		assert.equal(tool.name, 'get_guidelines')
		assert.deepEqual(tool.inputSchema, { type: 'object', properties: {} })
		assert.match(tool.description, /count toward their own asset class/)
	})

	it('reads the pinned gist and returns the summary as JSON text', async () => {
		const exchange = stubGist([guideline({ targetPct: 60 })])
		const payload = payloadOf(
			await createGetGuidelinesTool(credentials).handler({}),
		)

		assert.equal(exchange.requests.length, 1)
		assert.match(exchange.requests[0].url, /\/gists\/pinned-gist$/)
		assert.equal(payload.totalTargetPct, 60)
		assert.equal(payload.guidelines[0].etfType, 'equity')
	})

	it('reports a rejected read as an error instead of an empty target allocation', async () => {
		globalThis.fetch = async () => new Response(null, { status: 401 })
		await assert.rejects(
			async () => createGetGuidelinesTool(credentials).handler({}),
			/GitHub API error fetching guidelines gist: 401/,
		)
	})
})

describe('set_guideline tool', () => {
	it('creates an asset-class row and keeps the existing ones', async () => {
		const exchange = stubGist([guideline({ id: 'existing', targetPct: 40 })])
		const payload = payloadOf(
			await createSetGuidelineTool(credentials).handler({
				kind: 'asset_class',
				etfType: 'bond',
				targetPct: 25,
			}),
		)

		assert.equal(payload.action, 'created')
		assert.equal(payload.totalTargetPct, 65)
		assert.deepEqual(
			exchange.saved[0].map((row) => [row.etfType, row.targetPct]),
			[
				['bond', 25],
				['equity', 40],
			],
		)
	})

	it('updates the existing row for an asset class rather than adding a second', async () => {
		const exchange = stubGist([guideline({ id: 'existing', targetPct: 40 })])
		const payload = payloadOf(
			await createSetGuidelineTool(credentials).handler({
				kind: 'asset_class',
				etfType: 'equity',
				targetPct: 55,
			}),
		)

		assert.equal(payload.action, 'updated')
		assert.equal(payload.guideline?.id, 'existing')
		assert.equal(exchange.saved[0].length, 1)
		assert.equal(exchange.saved[0][0].targetPct, 55)
	})

	it('takes the asset class of an instrument from the catalog', async () => {
		stubCatalog()
		const exchange = stubGist([])
		const payload = payloadOf(
			await createSetGuidelineTool(credentials).handler({
				kind: 'instrument',
				ticker: 'vwce',
				targetPct: 30,
			}),
		)

		assert.equal(payload.guideline?.etfType, 'equity')
		assert.equal(exchange.saved[0][0].etfName, 'VWCE')
		assert.equal('warning' in payload, false)
	})

	it('refuses an asset class that contradicts the catalog', async () => {
		stubCatalog()
		stubGist([])
		await assert.rejects(
			async () =>
				createSetGuidelineTool(credentials).handler({
					kind: 'instrument',
					ticker: 'VWCE',
					targetPct: 30,
					etfType: 'bond',
				}),
			/classifies VWCE as "equity"/,
		)
	})

	it('accepts an unlisted ticker only with an explicit asset class, and says it was unverified', async () => {
		stubCatalog()
		stubGist([])
		await assert.rejects(
			async () =>
				createSetGuidelineTool(credentials).handler({
					kind: 'instrument',
					ticker: 'UNKNOWN',
					targetPct: 10,
				}),
			/not in the shared catalog/,
		)

		const payload = payloadOf(
			await createSetGuidelineTool(credentials).handler({
				kind: 'instrument',
				ticker: 'UNKNOWN',
				targetPct: 10,
				etfType: 'commodity',
			}),
		)
		assert.equal(payload.guideline?.etfType, 'commodity')
		assert.match(String(payload.warning), /not in the shared catalog/)
	})

	it('refuses a target that would push the total above 100%', async () => {
		const exchange = stubGist([
			guideline({ id: 'a', targetPct: 70 }),
			guideline({ id: 'b', etfType: 'bond', targetPct: 20 }),
		])
		await assert.rejects(
			async () =>
				createSetGuidelineTool(credentials).handler({
					kind: 'asset_class',
					etfType: 'commodity',
					targetPct: 15,
				}),
			/above the 100% cap.*already claim 90%/s,
		)
		assert.equal(exchange.saved.length, 0)
	})

	it('counts only the other rows when raising an existing target', async () => {
		const exchange = stubGist([
			guideline({ id: 'a', targetPct: 70 }),
			guideline({ id: 'b', etfType: 'bond', targetPct: 20 }),
		])
		const payload = payloadOf(
			await createSetGuidelineTool(credentials).handler({
				kind: 'asset_class',
				etfType: 'equity',
				targetPct: 80,
			}),
		)
		assert.equal(payload.totalTargetPct, 100)
		assert.equal(exchange.saved[0].length, 2)
	})

	it('rejects a target outside the allowed range, and a non-numeric one', async () => {
		stubGist([])
		const tool = createSetGuidelineTool(credentials)
		await assert.rejects(
			async () =>
				tool.handler({ kind: 'asset_class', etfType: 'bond', targetPct: 0 }),
			/must be between/,
		)
		await assert.rejects(
			async () =>
				tool.handler({
					kind: 'asset_class',
					etfType: 'bond',
					targetPct: 'a lot',
				}),
			/must be a number of percent/,
		)
	})

	it('accepts a numeric string, as models routinely send', async () => {
		const exchange = stubGist([])
		await createSetGuidelineTool(credentials).handler({
			kind: 'asset_class',
			etfType: 'bond',
			targetPct: '12,5',
		})
		assert.equal(exchange.saved[0][0].targetPct, 12.5)
	})

	it('names the valid asset classes when one is missing or wrong', async () => {
		stubGist([])
		const tool = createSetGuidelineTool(credentials)
		await assert.rejects(
			async () => tool.handler({ kind: 'asset_class', targetPct: 10 }),
			/needs "etfType".*money_market/s,
		)
		await assert.rejects(
			async () =>
				tool.handler({ kind: 'asset_class', etfType: 'crypto', targetPct: 10 }),
			/"etfType" must be one of/,
		)
		await assert.rejects(
			async () => tool.handler({ kind: 'fund', targetPct: 10 }),
			/"kind" must be one of/,
		)
	})

	it('surfaces a rejected write instead of reporting a save that did not happen', async () => {
		stubGist([], 403)
		await assert.rejects(
			async () =>
				createSetGuidelineTool(credentials).handler({
					kind: 'asset_class',
					etfType: 'bond',
					targetPct: 10,
				}),
			/GitHub API error saving guidelines gist: 403/,
		)
	})
})

describe('delete_guideline tool', () => {
	it('removes the named row and reports what is left', async () => {
		const exchange = stubGist([
			guideline({ id: 'keep', targetPct: 40 }),
			guideline({ id: 'drop', etfType: 'bond', targetPct: 30 }),
		])
		const payload = payloadOf(
			await createDeleteGuidelineTool(credentials).handler({ id: 'drop' }),
		)

		assert.equal(payload.deleted?.id, 'drop')
		assert.equal(payload.totalTargetPct, 40)
		assert.deepEqual(
			exchange.saved[0].map((row) => row.id),
			['keep'],
		)
	})

	it('says where the ids come from when the id is unknown or missing', async () => {
		const exchange = stubGist([guideline({ id: 'keep' })])
		const tool = createDeleteGuidelineTool(credentials)
		await assert.rejects(
			async () => tool.handler({ id: 'nope' }),
			/No guideline has id "nope".*get_guidelines/s,
		)
		await assert.rejects(async () => tool.handler({}), /"id" is required/)
		assert.equal(exchange.saved.length, 0)
	})
})
