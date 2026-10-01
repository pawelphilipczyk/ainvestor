import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { AdviceClient } from '../../app/features/advice/advice-client.ts'
import { setAdviceClient } from '../../app/features/advice/advice-client.ts'
import {
	ADVICE_BUY_NEXT_STORAGE_FILENAME,
	ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME,
} from '../../app/features/advice/advice-gist.ts'
import {
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../../app/features/catalog/lib.ts'
import { GIST_FILENAME } from '../../app/lib/gist.ts'
import { GUIDELINES_FILENAME } from '../../app/lib/guidelines.ts'
import { installFakeDataRepo } from '../../app/lib/store/github-repo-test-fake.ts'
import type { DataRepoCredentials } from '../data-repo.ts'
import { resetDataRepoCache } from '../data-repo.ts'
import { resetPrivateGistCacheForTests } from '../private-gist-cache.ts'
import { createGenerateAdviceTool } from './generate-advice.ts'

const credentials: DataRepoCredentials = {
	githubToken: 'token-value',
	dataRepo: 'octocat/ainvestor-data',
}

const HOLDINGS = [{ id: 'h1', name: 'A', value: 1000, currency: 'PLN' }]
const GUIDELINES = [
	{
		id: 'g1',
		kind: 'asset_class',
		etfName: '',
		targetPct: 100,
		etfType: 'equity',
	},
]

function adviceJson(text: string): string {
	return JSON.stringify({ blocks: [{ type: 'paragraph', text }] })
}

type FileWrite = { path: string; content: string }

/** Serve one fixed portfolio from a fake data repo; record each file written after it lands. */
function stubRepo(options: { failWritesWith?: number } = {}): {
	writes: FileWrite[]
	commitMessages: string[]
} {
	const repo = installFakeDataRepo({
		files: {
			[GIST_FILENAME]: JSON.stringify(HOLDINGS),
			[GUIDELINES_FILENAME]: JSON.stringify(GUIDELINES),
		},
		...options,
	})
	const repoFetch = globalThis.fetch
	const writes: FileWrite[] = []
	globalThis.fetch = async (input, init) => {
		const response = await repoFetch(input, init)
		if ((init?.method ?? 'GET') === 'PUT' && response.ok) {
			const path = new URL(String(input)).pathname.split('/contents/')[1] ?? ''
			writes.push({ path, content: repo.files.get(path) ?? '' })
		}
		return response
	}
	return { writes, commitMessages: repo.commitMessages }
}

/** Records every completion request and every file written, serving one fixed portfolio. */
function stubServer(): {
	completions: { model: string }[]
	writes: FileWrite[]
	commitMessages: string[]
} {
	const completions: { model: string }[] = []
	setAdviceClient({
		chat: {
			completions: {
				create: async (params) => {
					completions.push({ model: params.model })
					return { choices: [{ message: { content: adviceJson('Buy VTI.') } }] }
				},
			},
		},
	} satisfies AdviceClient)
	return { completions, ...stubRepo() }
}

async function callTool(
	toolArguments: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const tool = createGenerateAdviceTool(credentials)
	const result = await tool.handler(toolArguments)
	return JSON.parse(result.content[0].text) as Record<string, unknown>
}

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	setAdviceClient(null)
	resetDataRepoCache()
	resetSharedCatalogForTests()
	resetPrivateGistCacheForTests()
})

describe('generate_advice', () => {
	it('generates buy_next advice and saves it by default, like the web app Generate button', async () => {
		setSharedCatalogForTests({ entries: [] })
		const { completions, writes } = stubServer()

		const payload = await callTool({ cashAmount: '500' })

		assert.equal(payload.available, true)
		assert.equal(payload.mode, 'buy_next')
		assert.equal(payload.model, 'gpt-5.6-terra')
		assert.equal(payload.cashAmount, '500')
		assert.equal(payload.cashCurrency, 'PLN')
		assert.equal(payload.text, 'Buy VTI.')
		assert.equal(payload.saved, true)
		assert.equal(typeof payload.savedAt, 'number')
		assert.equal(completions.length, 1)
		assert.equal(completions[0].model, 'gpt-5.6-terra')
		assert.equal(writes.length, 1)
	})

	it('skips saving when save: false is passed', async () => {
		setSharedCatalogForTests({ entries: [] })
		const { writes } = stubServer()

		const payload = await callTool({ cashAmount: '500', save: false })

		assert.equal(payload.saved, false)
		assert.equal('savedAt' in payload, false)
		assert.equal(writes.length, 0)
	})

	it('requires cashAmount for buy_next', async () => {
		setSharedCatalogForTests({ entries: [] })
		stubServer()

		await assert.rejects(async () => callTool({}), /"cashAmount" is required/)
	})

	it('ignores cashAmount for portfolio_review and omits cash fields', async () => {
		setSharedCatalogForTests({ entries: [] })
		stubServer()

		const payload = await callTool({ mode: 'portfolio_review' })

		assert.equal(payload.mode, 'portfolio_review')
		assert.equal('cashAmount' in payload, false)
		assert.equal('cashCurrency' in payload, false)
		assert.equal(payload.text, 'Buy VTI.')
	})

	it('ignores an invalid cashCurrency for portfolio_review too, as the schema promises', async () => {
		setSharedCatalogForTests({ entries: [] })
		stubServer()

		const payload = await callTool({
			mode: 'portfolio_review',
			cashCurrency: 'not-a-currency',
		})

		assert.equal(payload.mode, 'portfolio_review')
		assert.equal(payload.text, 'Buy VTI.')
	})

	it('rejects a model outside the accepted list', async () => {
		setSharedCatalogForTests({ entries: [] })
		stubServer()

		await assert.rejects(
			async () => callTool({ cashAmount: '100', model: 'gpt-9000' }),
			/"model" must be one of/,
		)
	})

	it('rejects a model of the wrong type instead of silently defaulting it', async () => {
		setSharedCatalogForTests({ entries: [] })
		stubServer()

		await assert.rejects(
			async () => callTool({ cashAmount: '100', model: 5 }),
			/"model" must be one of/,
		)
	})

	it('passes a named model through to the completion call', async () => {
		setSharedCatalogForTests({ entries: [] })
		const { completions } = stubServer()

		const payload = await callTool({ cashAmount: '100', model: 'gpt-5.6-luna' })

		assert.equal(payload.model, 'gpt-5.6-luna')
		assert.equal(completions[0].model, 'gpt-5.6-luna')
	})

	it('saves to the mode-specific file', async () => {
		setSharedCatalogForTests({ entries: [] })
		const { writes } = stubServer()

		const payload = await callTool({ cashAmount: '500' })

		assert.equal(payload.saved, true)
		assert.equal(typeof payload.savedAt, 'number')
		assert.equal(writes.length, 1)
		const savedFile = writes.find(
			(write) => write.path === ADVICE_BUY_NEXT_STORAGE_FILENAME,
		)
		assert.ok(savedFile, 'expected the buy_next advice file to be written')
		const saved = JSON.parse(savedFile.content) as Record<string, unknown>
		assert.equal(saved.lastAnalysisMode, 'buy_next')
		assert.equal(saved.cashAmount, '500')
		assert.deepEqual(saved.document, {
			blocks: [{ type: 'paragraph', text: 'Buy VTI.' }],
		})
	})

	it('saves portfolio_review under its own file, without a cashAmount field', async () => {
		setSharedCatalogForTests({ entries: [] })
		const { writes } = stubServer()

		await callTool({ mode: 'portfolio_review' })

		const savedFile = writes.find(
			(write) => write.path === ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME,
		)
		assert.ok(
			savedFile,
			'expected the portfolio_review advice file to be written',
		)
		const saved = JSON.parse(savedFile.content) as Record<string, unknown>
		assert.equal('cashAmount' in saved, false)
	})

	it('commits the saved advice with a message naming its mode and the MCP server', async () => {
		setSharedCatalogForTests({ entries: [] })
		const { commitMessages } = stubServer()

		await callTool({ mode: 'portfolio_review' })

		assert.deepEqual(commitMessages, ['Save portfolio-review advice (MCP)'])
	})

	it('reports a failed save without losing the generated text', async () => {
		setSharedCatalogForTests({ entries: [] })
		setAdviceClient({
			chat: {
				completions: {
					create: async () => ({
						choices: [{ message: { content: adviceJson('Buy VTI.') } }],
					}),
				},
			},
		})
		stubRepo({ failWritesWith: 500 })

		const payload = await callTool({ cashAmount: '500' })

		assert.equal(payload.saved, false)
		assert.equal(payload.text, 'Buy VTI.')
		assert.match(String(payload.savePersistFailed), /500/)
	})
})
