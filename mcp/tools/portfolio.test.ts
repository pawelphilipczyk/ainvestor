import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { CatalogEntry } from '../../app/features/catalog/lib.ts'
import {
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../../app/features/catalog/lib.ts'
import type { EtfEntry } from '../../app/lib/gist.ts'
import { GIST_FILENAME } from '../../app/lib/gist.ts'
import { installFakeDataRepo } from '../../app/lib/store/github-repo-test-fake.ts'
import { setRetryPauseForTests } from '../../app/lib/store/read-modify-write.ts'
import type { DataRepoCredentials } from '../data-repo.ts'
import { resetDataRepoCache, resolveDataRepo } from '../data-repo.ts'
import { resetPrivateGistCacheForTests } from '../private-gist-cache.ts'
import {
	createGetPortfolioTool,
	createRecordOperationTool,
	createRemoveHoldingTool,
	summarizePortfolio,
} from './portfolio.ts'

const config: DataRepoCredentials = {
	githubToken: 'token-value',
	dataRepo: 'octocat/ainvestor-data',
}

function entry(overrides: Partial<EtfEntry> = {}): EtfEntry {
	return { id: 'a', name: 'VWCE', value: 1000, currency: 'PLN', ...overrides }
}

/** Serve `entries` from a fake data repo, returning every request made to it. */
function stubGist(entries: EtfEntry[]): string[] {
	return installFakeDataRepo({
		files: { [GIST_FILENAME]: JSON.stringify(entries) },
	}).requests
}

/** A catalog entry the write-tool tests resolve `instrumentTicker` against. */
function catalogEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
	return {
		id: 't:VWCE',
		ticker: 'VWCE',
		name: 'Vanguard FTSE All-World',
		type: 'equity',
		description: '',
		...overrides,
	}
}

/** Serve `entries` from a fake data repo and record the holdings after each write. */
function stubGistReadWrite(entries: EtfEntry[]): {
	saved: EtfEntry[][]
	requestedMethods: string[]
} {
	const repo = installFakeDataRepo({
		files: { [GIST_FILENAME]: JSON.stringify(entries) },
	})
	const repoFetch = globalThis.fetch
	const saved: EtfEntry[][] = []
	const requestedMethods: string[] = []
	globalThis.fetch = async (input, init) => {
		const method = init?.method ?? 'GET'
		requestedMethods.push(method)
		const response = await repoFetch(input, init)
		if (method === 'PUT' && response.ok) {
			saved.push(
				JSON.parse(repo.files.get(GIST_FILENAME) ?? '[]') as EtfEntry[],
			)
		}
		return response
	}
	return { saved, requestedMethods }
}

// The pause between save attempts is for real GitHub; the give-up case would just sleep.
setRetryPauseForTests(0)

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	resetDataRepoCache()
	resetPrivateGistCacheForTests()
	resetSharedCatalogForTests()
})

describe('summarizePortfolio', () => {
	it('reports an empty portfolio as empty, not as mixed currency', () => {
		const summary = summarizePortfolio([])
		assert.equal(summary.holdingCount, 0)
		assert.equal(summary.totalValue, null)
		assert.equal(summary.mixedCurrencies, false)
		assert.match(String(summary.note), /empty/i)
	})

	it('totals a single-currency portfolio and computes shares', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 3000 }),
			entry({ id: 'b', name: 'IWDA', value: 1000 }),
		])
		assert.equal(summary.totalValue, 4000)
		assert.equal(summary.currency, 'PLN')
		assert.equal(summary.mixedCurrencies, false)
		assert.deepEqual(
			summary.holdings.map((holding) => holding.sharePct),
			[75, 25],
		)
	})

	it('withholds the total and shares when currencies are mixed', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 3000, currency: 'PLN' }),
			entry({ id: 'b', value: 1000, currency: 'EUR' }),
		])
		assert.equal(summary.mixedCurrencies, true)
		assert.equal(summary.totalValue, null)
		assert.equal(summary.currency, null)
		assert.match(String(summary.note), /FX/)
		for (const holding of summary.holdings) {
			assert.equal('sharePct' in holding, false)
		}
	})

	it('rounds shares and totals to two decimals', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 1 }),
			entry({ id: 'b', value: 2 }),
		])
		assert.equal(summary.holdings[0].sharePct, 33.33)
		assert.equal(summary.holdings[1].sharePct, 66.67)
	})

	it('reports a negative holding at its real share, not clamped to zero', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 4500 }),
			entry({ id: 'b', value: -500 }),
		])
		assert.equal(summary.totalValue, 4000)
		assert.equal(summary.holdings[1].sharePct, -12.5)
	})

	it('omits the share and flags the row when a value is not finite', () => {
		const summary = summarizePortfolio([
			entry({ id: 'a', value: 1000 }),
			entry({ id: 'b', value: Number.POSITIVE_INFINITY }),
		])
		assert.equal(summary.holdings[0].sharePct, 100)
		assert.equal('sharePct' in summary.holdings[1], false)
		assert.match(String(summary.note), /non-numeric value/)
	})

	it('omits shares when every holding is zero', () => {
		const summary = summarizePortfolio([entry({ value: 0 })])
		assert.equal(summary.totalValue, 0)
		assert.equal('sharePct' in summary.holdings[0], false)
	})

	it('carries ticker and exchange through only when present', () => {
		const summary = summarizePortfolio([
			entry({ ticker: 'VWCE', exchange: 'XETRA' }),
		])
		assert.equal(summary.holdings[0].ticker, 'VWCE')
		assert.equal(summary.holdings[0].exchange, 'XETRA')
		const bare = summarizePortfolio([entry()])
		assert.equal('ticker' in bare.holdings[0], false)
		assert.equal('exchange' in bare.holdings[0], false)
	})
})

describe('data repo resolution', () => {
	const ownRepo: DataRepoCredentials = { ...config, dataRepo: null }

	it("resolves the token owner's own repo when none is pinned", async () => {
		installFakeDataRepo()
		assert.equal(await resolveDataRepo(ownRepo), 'octocat/ainvestor-data')
	})

	it('serves a pinned repo without looking up the owner', async () => {
		const repo = installFakeDataRepo({ login: 'someone-else' })
		assert.equal(await resolveDataRepo(config), 'octocat/ainvestor-data')
		assert.deepEqual(repo.requests, ['GET /user'])
	})

	it('looks up only once for concurrent callers', async () => {
		const repo = installFakeDataRepo()
		const [first, second] = await Promise.all([
			resolveDataRepo(ownRepo),
			resolveDataRepo(ownRepo),
		])
		assert.equal(first, 'octocat/ainvestor-data')
		assert.equal(second, 'octocat/ainvestor-data')
		assert.equal(
			repo.requests.filter((request) => request === 'GET /user').length,
			1,
		)
	})

	it('explains what to do when the repo does not exist, and never creates one', async () => {
		const repo = installFakeDataRepo({ absent: true })
		await assert.rejects(
			async () => resolveDataRepo(ownRepo),
			/octocat\/ainvestor-data does not exist yet/,
		)
		assert.equal(
			repo.requests.some((request) => !request.startsWith('GET ')),
			false,
		)
	})

	it('asks to reconnect, with a 403 the transport maps to 401, when the token lacks repo', async () => {
		const repo = installFakeDataRepo({ scopes: 'gist' })
		await assert.rejects(
			async () => resolveDataRepo(ownRepo),
			/403.*repo scope.*Reconnect/s,
		)
		assert.deepEqual(repo.requests, ['GET /user'])
	})

	it('does not cache a failure, so a retry after signing in succeeds', async () => {
		installFakeDataRepo({ absent: true })
		await assert.rejects(async () => resolveDataRepo(ownRepo))
		installFakeDataRepo()
		assert.equal(await resolveDataRepo(ownRepo), 'octocat/ainvestor-data')
	})
})

describe('get_portfolio tool', () => {
	it('declares a no-argument input schema', () => {
		const tool = createGetPortfolioTool(config)
		assert.equal(tool.name, 'get_portfolio')
		assert.deepEqual(tool.inputSchema, { type: 'object', properties: {} })
	})

	it('warns in its description that there is no time or quantity data', () => {
		const tool = createGetPortfolioTool(config)
		assert.match(tool.description, /no quantities, prices, or dates/)
	})

	it('get_portfolio reads the pinned repo and returns the summary as JSON text', async () => {
		const requests = stubGist([entry({ value: 2500 })])
		const tool = createGetPortfolioTool(config)

		const result = await tool.handler({})

		assert.ok(
			requests.includes(
				`GET /repos/octocat/ainvestor-data/contents/${GIST_FILENAME}`,
			),
		)
		assert.equal(result.content.length, 1)
		const payload = JSON.parse(result.content[0].text) as {
			totalValue: number
			holdings: { name: string }[]
		}
		assert.equal(payload.totalValue, 2500)
		assert.deepEqual(
			payload.holdings.map((holding) => holding.name),
			['VWCE'],
		)
	})

	it('propagates a GitHub failure so the dispatcher can mark it as a tool error', async () => {
		installFakeDataRepo({ failWith: 500 })
		const tool = createGetPortfolioTool(config)
		await assert.rejects(async () => tool.handler({}), /GitHub API error.*500/)
	})
})

describe('record_operation tool', () => {
	it('declares the fields required to buy or sell', () => {
		const tool = createRecordOperationTool(config)
		assert.equal(tool.name, 'record_operation')
		assert.deepEqual(tool.inputSchema.required, [
			'portfolioOperation',
			'instrumentTicker',
			'value',
			'currency',
		])
	})

	it('buys against an existing holding, adding to its value', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		const { saved } = stubGistReadWrite([
			entry({ ticker: 'VWCE', value: 1000, currency: 'PLN' }),
		])
		const tool = createRecordOperationTool(config)

		const result = await tool.handler({
			portfolioOperation: 'buy',
			instrumentTicker: 'VWCE',
			value: '500',
			currency: 'PLN',
		})

		const payload = JSON.parse(result.content[0].text) as {
			action: string
			entry: { value: number }
			totalValue: number
		}
		assert.equal(payload.action, 'updated')
		assert.equal(payload.entry.value, 1500)
		assert.equal(payload.totalValue, 1500)
		assert.equal(saved.length, 1)
		assert.equal(saved[0][0].value, 1500)
	})

	it('carries the exchange through in the response, like get_portfolio does', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		stubGistReadWrite([
			entry({
				ticker: 'VWCE',
				value: 1000,
				currency: 'PLN',
				exchange: 'XETRA',
			}),
		])
		const tool = createRecordOperationTool(config)

		const result = await tool.handler({
			portfolioOperation: 'buy',
			instrumentTicker: 'VWCE',
			value: '500',
			currency: 'PLN',
		})

		const payload = JSON.parse(result.content[0].text) as {
			entry: { exchange?: string }
		}
		assert.equal(payload.entry.exchange, 'XETRA')
	})

	it('accepts a currency with incidental whitespace', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		stubGistReadWrite([entry({ ticker: 'VWCE', value: 1000, currency: 'PLN' })])
		const tool = createRecordOperationTool(config)

		const result = await tool.handler({
			portfolioOperation: 'buy',
			instrumentTicker: 'VWCE',
			value: '500',
			currency: ' PLN ',
		})

		const payload = JSON.parse(result.content[0].text) as {
			entry: { currency: string }
		}
		assert.equal(payload.entry.currency, 'PLN')
	})

	it('buys a ticker with no matching holding, creating a new row', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		const { saved } = stubGistReadWrite([])
		const tool = createRecordOperationTool(config)

		const result = await tool.handler({
			portfolioOperation: 'buy',
			instrumentTicker: 'VWCE',
			value: 1000,
			currency: 'PLN',
		})

		const payload = JSON.parse(result.content[0].text) as {
			action: string
			holdingCount: number
		}
		assert.equal(payload.action, 'created')
		assert.equal(payload.holdingCount, 1)
		assert.equal(saved[0].length, 1)
	})

	it('sells part of a holding, leaving the remainder', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		const { saved } = stubGistReadWrite([
			entry({ ticker: 'VWCE', value: 1000, currency: 'PLN' }),
		])
		const tool = createRecordOperationTool(config)

		const result = await tool.handler({
			portfolioOperation: 'sell',
			instrumentTicker: 'VWCE',
			value: 400,
			currency: 'PLN',
		})

		const payload = JSON.parse(result.content[0].text) as {
			action: string
			entry: { value: number }
		}
		assert.equal(payload.action, 'updated')
		assert.equal(payload.entry.value, 600)
		assert.equal(saved[0][0].value, 600)
	})

	it('sells a holding down to zero, removing the row entirely', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		const { saved } = stubGistReadWrite([
			entry({ ticker: 'VWCE', value: 400, currency: 'PLN' }),
		])
		const tool = createRecordOperationTool(config)

		const result = await tool.handler({
			portfolioOperation: 'sell',
			instrumentTicker: 'VWCE',
			value: 400,
			currency: 'PLN',
		})

		const payload = JSON.parse(result.content[0].text) as {
			action: string
			holdingCount: number
		}
		assert.equal(payload.action, 'removed')
		assert.equal(payload.holdingCount, 0)
		assert.equal(saved[0].length, 0)
	})

	it('refuses a ticker the shared catalog does not list, without writing', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		const { saved, requestedMethods } = stubGistReadWrite([])
		const tool = createRecordOperationTool(config)

		await assert.rejects(
			async () =>
				tool.handler({
					portfolioOperation: 'buy',
					instrumentTicker: 'UNKNOWN',
					value: 100,
					currency: 'PLN',
				}),
			/not in the shared catalog/,
		)
		assert.equal(saved.length, 0)
		assert.equal(
			requestedMethods.every((method) => method === 'GET'),
			true,
		)
	})

	it('refuses a sell exceeding the matching holding, without writing', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		const { saved } = stubGistReadWrite([
			entry({ ticker: 'VWCE', value: 100, currency: 'PLN' }),
		])
		const tool = createRecordOperationTool(config)

		await assert.rejects(
			async () =>
				tool.handler({
					portfolioOperation: 'sell',
					instrumentTicker: 'VWCE',
					value: 200,
					currency: 'PLN',
				}),
			/more than the matching holding/,
		)
		assert.equal(saved.length, 0)
	})

	it('refuses a currency the app does not support', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		stubGistReadWrite([])
		const tool = createRecordOperationTool(config)

		await assert.rejects(
			async () =>
				tool.handler({
					portfolioOperation: 'buy',
					instrumentTicker: 'VWCE',
					value: 100,
					currency: 'XYZ',
				}),
			/"currency" must be one of/,
		)
	})
})

describe('commit messages', () => {
	function repoWith(entries: EtfEntry[]) {
		return installFakeDataRepo({
			files: { [GIST_FILENAME]: JSON.stringify(entries) },
		})
	}

	it('names a buy, its amount, and that the MCP server made it', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		const repo = repoWith([entry({ ticker: 'VWCE', value: 1000 })])

		await createRecordOperationTool(config).handler({
			portfolioOperation: 'buy',
			instrumentTicker: 'vwce',
			value: '500',
			currency: 'pln',
		})

		assert.deepEqual(repo.commitMessages, ['Buy VWCE: +500 PLN (MCP)'])
	})

	it('names a sell with a minus sign', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		const repo = repoWith([entry({ ticker: 'VWCE', value: 1000 })])

		await createRecordOperationTool(config).handler({
			portfolioOperation: 'sell',
			instrumentTicker: 'VWCE',
			value: '250',
			currency: 'PLN',
		})

		assert.deepEqual(repo.commitMessages, ['Sell VWCE: -250 PLN (MCP)'])
	})

	it('names the holding a removal dropped', async () => {
		const repo = repoWith([
			entry({ id: 'keep' }),
			entry({ id: 'drop', name: 'Gold ETC' }),
		])

		await createRemoveHoldingTool(config).handler({ id: 'drop' })

		assert.deepEqual(repo.commitMessages, ['Remove holding Gold ETC (MCP)'])
	})
})

describe('concurrent writes', () => {
	it('keeps a holding another client saved between this call’s read and its save', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		let intruded = false
		const repo = installFakeDataRepo({
			files: {
				[GIST_FILENAME]: JSON.stringify([
					entry({
						id: 'mine',
						name: 'Vanguard FTSE All-World',
						ticker: 'VWCE',
					}),
				]),
			},
			afterContentRead: (path, fake) => {
				if (path !== GIST_FILENAME || intruded) return
				intruded = true
				// Another client (the web app, say) saves a new holding right now.
				fake.externalWrite(
					GIST_FILENAME,
					JSON.stringify([
						entry({
							id: 'mine',
							name: 'Vanguard FTSE All-World',
							ticker: 'VWCE',
						}),
						entry({ id: 'theirs', name: 'Gold ETC', value: 700 }),
					]),
				)
			},
		})

		await createRecordOperationTool(config).handler({
			portfolioOperation: 'buy',
			instrumentTicker: 'VWCE',
			value: '500',
			currency: 'PLN',
		})

		const stored = JSON.parse(
			repo.files.get(GIST_FILENAME) ?? '[]',
		) as EtfEntry[]
		assert.deepEqual(stored.map((holding) => holding.id).sort(), [
			'mine',
			'theirs',
		])
		assert.equal(stored.find((holding) => holding.id === 'mine')?.value, 1500)
	})

	it('applies a removal on top of a holding another client added in between', async () => {
		let intruded = false
		const repo = installFakeDataRepo({
			files: {
				[GIST_FILENAME]: JSON.stringify([
					entry({ id: 'drop', name: 'Gold ETC' }),
					entry({ id: 'keep', name: 'Bonds' }),
				]),
			},
			afterContentRead: (path, fake) => {
				if (path !== GIST_FILENAME || intruded) return
				intruded = true
				fake.externalWrite(
					GIST_FILENAME,
					JSON.stringify([
						entry({ id: 'drop', name: 'Gold ETC' }),
						entry({ id: 'keep', name: 'Bonds' }),
						entry({ id: 'theirs', name: 'Equities' }),
					]),
				)
			},
		})

		await createRemoveHoldingTool(config).handler({ id: 'drop' })

		const stored = JSON.parse(
			repo.files.get(GIST_FILENAME) ?? '[]',
		) as EtfEntry[]
		assert.deepEqual(stored.map((holding) => holding.id).sort(), [
			'keep',
			'theirs',
		])
	})

	it('tells the model nothing was saved when the file keeps changing underneath it', async () => {
		setSharedCatalogForTests({ entries: [catalogEntry()], ownerLogin: null })
		const original = JSON.stringify([entry({ ticker: 'VWCE', value: 1000 })])
		const repo = installFakeDataRepo({
			files: { [GIST_FILENAME]: original },
			// Every read is followed by another client saving the same content.
			afterContentRead: (path, fake) => {
				if (path === GIST_FILENAME) fake.externalWrite(path, original)
			},
		})

		await assert.rejects(
			createRecordOperationTool(config).handler({
				portfolioOperation: 'buy',
				instrumentTicker: 'VWCE',
				value: '500',
				currency: 'PLN',
			}),
			/changed elsewhere.*nothing was saved.*get_portfolio/s,
		)
		assert.deepEqual(repo.commitMessages, [])
		assert.equal(repo.files.get(GIST_FILENAME), original)
	})
})

describe('remove_holding tool', () => {
	it('deletes a holding by id and reports the remaining portfolio', async () => {
		const { saved } = stubGistReadWrite([
			entry({ id: 'keep', value: 500 }),
			entry({ id: 'drop', value: 300 }),
		])
		const tool = createRemoveHoldingTool(config)

		const result = await tool.handler({ id: 'drop' })

		const payload = JSON.parse(result.content[0].text) as {
			action: string
			removed: { id: string }
			holdingCount: number
		}
		assert.equal(payload.action, 'removed')
		assert.equal(payload.removed.id, 'drop')
		assert.equal(payload.holdingCount, 1)
		assert.equal(saved[0].length, 1)
		assert.equal(saved[0][0].id, 'keep')
	})

	it('refuses an unknown id, without writing', async () => {
		const { saved } = stubGistReadWrite([entry({ id: 'keep' })])
		const tool = createRemoveHoldingTool(config)

		await assert.rejects(
			async () => tool.handler({ id: 'missing' }),
			/No holding has id "missing"/,
		)
		assert.equal(saved.length, 0)
	})
})
