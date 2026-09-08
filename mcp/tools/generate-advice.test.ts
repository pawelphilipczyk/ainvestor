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
import type { GistCredentials } from '../data-gist.ts'
import { resetDataGistIdCache } from '../data-gist.ts'
import { resetPrivateGistCacheForTests } from '../private-gist-cache.ts'
import { createGenerateAdviceTool } from './generate-advice.ts'

const credentials: GistCredentials = {
	githubToken: 'token-value',
	dataGistId: 'pinned-gist',
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

/** Records every completion request and every gist PATCH, serving one fixed portfolio. */
function stubServer(): {
	completions: { model: string }[]
	patches: {
		url: string
		body: { files: Record<string, { content: string }> }
	}[]
} {
	const completions: { model: string }[] = []
	const patches: {
		url: string
		body: { files: Record<string, { content: string }> }
	}[] = []

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

	globalThis.fetch = async (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	) => {
		const method = init?.method ?? 'GET'
		if (method === 'PATCH') {
			const body = JSON.parse(String(init?.body)) as {
				files: Record<string, { content: string }>
			}
			patches.push({ url: String(input), body })
			return new Response(null, { status: 200 })
		}
		return Response.json({
			files: {
				[GIST_FILENAME]: { content: JSON.stringify(HOLDINGS) },
				[GUIDELINES_FILENAME]: { content: JSON.stringify(GUIDELINES) },
			},
		})
	}

	return { completions, patches }
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
	resetDataGistIdCache()
	resetSharedCatalogForTests()
	resetPrivateGistCacheForTests()
})

describe('generate_advice', () => {
	it('generates buy_next advice and does not save unless asked', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		const { completions, patches } = stubServer()

		const payload = await callTool({ cashAmount: '500' })

		assert.equal(payload.available, true)
		assert.equal(payload.mode, 'buy_next')
		assert.equal(payload.model, 'gpt-5.6-sol')
		assert.equal(payload.cashAmount, '500')
		assert.equal(payload.cashCurrency, 'PLN')
		assert.equal(payload.text, 'Buy VTI.')
		assert.equal(payload.saved, false)
		assert.equal('savedAt' in payload, false)
		assert.equal(completions.length, 1)
		assert.equal(completions[0].model, 'gpt-5.6-sol')
		assert.equal(patches.length, 0)
	})

	it('requires cashAmount for buy_next', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		stubServer()

		await assert.rejects(async () => callTool({}), /"cashAmount" is required/)
	})

	it('ignores cashAmount for portfolio_review and omits cash fields', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		stubServer()

		const payload = await callTool({ mode: 'portfolio_review' })

		assert.equal(payload.mode, 'portfolio_review')
		assert.equal('cashAmount' in payload, false)
		assert.equal('cashCurrency' in payload, false)
		assert.equal(payload.text, 'Buy VTI.')
	})

	it('rejects a model outside the accepted list', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		stubServer()

		await assert.rejects(
			async () => callTool({ cashAmount: '100', model: 'gpt-9000' }),
			/"model" must be one of/,
		)
	})

	it('passes a named model through to the completion call', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		const { completions } = stubServer()

		const payload = await callTool({ cashAmount: '100', model: 'gpt-5.6-luna' })

		assert.equal(payload.model, 'gpt-5.6-luna')
		assert.equal(completions[0].model, 'gpt-5.6-luna')
	})

	it('saves to the mode-specific file when save is true', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		const { patches } = stubServer()

		const payload = await callTool({ cashAmount: '500', save: true })

		assert.equal(payload.saved, true)
		assert.equal(typeof payload.savedAt, 'number')
		assert.equal(patches.length, 1)
		assert.match(patches[0].url, /\/gists\/pinned-gist$/)
		const savedFile = patches[0].body.files[ADVICE_BUY_NEXT_STORAGE_FILENAME]
		assert.ok(savedFile, 'expected the buy_next advice file to be written')
		const saved = JSON.parse(savedFile.content) as Record<string, unknown>
		assert.equal(saved.lastAnalysisMode, 'buy_next')
		assert.equal(saved.cashAmount, '500')
		assert.deepEqual(saved.document, {
			blocks: [{ type: 'paragraph', text: 'Buy VTI.' }],
		})
	})

	it('saves portfolio_review under its own file, without a cashAmount field', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		const { patches } = stubServer()

		await callTool({ mode: 'portfolio_review', save: true })

		const savedFile =
			patches[0].body.files[ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME]
		assert.ok(
			savedFile,
			'expected the portfolio_review advice file to be written',
		)
		const saved = JSON.parse(savedFile.content) as Record<string, unknown>
		assert.equal('cashAmount' in saved, false)
	})

	it('reports a failed save without losing the generated text', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		setAdviceClient({
			chat: {
				completions: {
					create: async () => ({
						choices: [{ message: { content: adviceJson('Buy VTI.') } }],
					}),
				},
			},
		})
		globalThis.fetch = async (
			_input: Parameters<typeof fetch>[0],
			init?: Parameters<typeof fetch>[1],
		) => {
			const method = init?.method ?? 'GET'
			if (method === 'PATCH') return new Response('nope', { status: 500 })
			return Response.json({
				files: {
					[GIST_FILENAME]: { content: JSON.stringify(HOLDINGS) },
					[GUIDELINES_FILENAME]: { content: JSON.stringify(GUIDELINES) },
				},
			})
		}

		const payload = await callTool({ cashAmount: '500', save: true })

		assert.equal(payload.saved, false)
		assert.equal(payload.text, 'Buy VTI.')
		assert.match(String(payload.savePersistFailed), /500/)
	})
})
