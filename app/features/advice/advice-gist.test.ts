import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
	ADVICE_BUY_NEXT_STORAGE_FILENAME,
	ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME,
	ADVICE_STORAGE_FILENAME,
	clearLegacyUnifiedAdviceAnalysis,
	clearStoredAdviceAnalysis,
	clearStoredAdviceAnalysisForTab,
	fetchStoredAdviceAnalysisForTab,
	fetchStoredAdviceAnalysisOutcomeForTab,
	parseStoredAdviceAnalysisFromGistFile,
	resetAdviceGistTestOverlay,
	type StoredAdviceAnalysis,
	saveStoredAdviceAnalysisForTab,
	setAdviceGistTestOverlay,
} from './advice-gist.ts'
import { DEFAULT_ADVICE_MODEL } from './advice-openai.ts'

afterEach(() => {
	resetAdviceGistTestOverlay()
})

const sampleStoredAnalysis: StoredAdviceAnalysis = {
	version: 1,
	savedAt: 1_700_000_000_000,
	lastAnalysisMode: 'buy_next',
	cashCurrency: 'PLN',
	cashAmount: '100',
	selectedModel: 'gpt-5.6-sol',
	activeTab: 'buy_next',
	document: { blocks: [{ type: 'paragraph', text: 'Buy VTI.' }] },
}

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

/** Runs `run` with `globalThis.fetch` stubbed, real-network path only (no test overlay). */
async function withStubbedFetch(
	handler: (
		input: FetchInput,
		init?: FetchInit,
	) => Response | Promise<Response>,
	run: () => Promise<void>,
): Promise<void> {
	const originalFetch = globalThis.fetch
	globalThis.fetch = async (input: FetchInput, init?: FetchInit) =>
		handler(input, init)
	try {
		await run()
	} finally {
		globalThis.fetch = originalFetch
	}
}

describe('advice gist storage', () => {
	it('parseStoredAdviceAnalysisFromGistFile returns null for empty or invalid JSON', () => {
		assert.equal(parseStoredAdviceAnalysisFromGistFile(null), null)
		assert.equal(parseStoredAdviceAnalysisFromGistFile(''), null)
		assert.equal(parseStoredAdviceAnalysisFromGistFile('not json'), null)
	})

	it('parseStoredAdviceAnalysisFromGistFile accepts a minimal valid snapshot', () => {
		const raw = JSON.stringify({
			version: 1,
			savedAt: 1_700_000_000_000,
			lastAnalysisMode: 'portfolio_review',
			cashCurrency: 'PLN',
			selectedModel: 'gpt-5.6-sol',
			document: {
				blocks: [{ type: 'paragraph', text: 'Hello.' }],
			},
		})
		const parsed = parseStoredAdviceAnalysisFromGistFile(raw)
		assert.ok(parsed)
		assert.equal(parsed?.lastAnalysisMode, 'portfolio_review')
		assert.equal(parsed?.document.blocks[0]?.type, 'paragraph')
	})

	it('parseStoredAdviceAnalysisFromGistFile keeps snapshots saved under a retired model id', () => {
		const raw = JSON.stringify({
			version: 1,
			savedAt: 1_700_000_000_000,
			lastAnalysisMode: 'buy_next',
			cashCurrency: 'PLN',
			cashAmount: '100',
			selectedModel: 'gpt-5.4-mini',
			document: {
				blocks: [{ type: 'paragraph', text: 'Old advice.' }],
			},
		})
		const parsed = parseStoredAdviceAnalysisFromGistFile(raw)
		assert.ok(parsed)
		assert.equal(parsed?.selectedModel, DEFAULT_ADVICE_MODEL)
	})

	it('fetchStoredAdviceAnalysisForTab reads the matching tab from test overlay only', async () => {
		const buyNextStored = {
			version: 1 as const,
			savedAt: 1,
			lastAnalysisMode: 'buy_next' as const,
			cashCurrency: 'PLN',
			cashAmount: '100',
			selectedModel: 'gpt-5.6-sol' as const,
			activeTab: 'buy_next' as const,
			document: { blocks: [{ type: 'paragraph' as const, text: 'Buy' }] },
		}
		setAdviceGistTestOverlay(buyNextStored)
		const forBuy = await fetchStoredAdviceAnalysisForTab('t', 'g', 'buy_next')
		const forReview = await fetchStoredAdviceAnalysisForTab(
			't',
			'g',
			'portfolio_review',
		)
		assert.ok(forBuy)
		const firstBlock = forBuy.document.blocks[0]
		assert.equal(firstBlock?.type, 'paragraph')
		if (firstBlock?.type === 'paragraph') {
			assert.equal(firstBlock.text, 'Buy')
		}
		assert.equal(forReview, null)
	})

	it('fetchStoredAdviceAnalysisOutcomeForTab separates missing, malformed and unreadable', async () => {
		const originalFetch = globalThis.fetch
		try {
			globalThis.fetch = async () =>
				Response.json({
					files: {
						[ADVICE_BUY_NEXT_STORAGE_FILENAME]: { content: '{"version": 1,' },
					},
				})
			const malformed = await fetchStoredAdviceAnalysisOutcomeForTab(
				't',
				'g',
				'buy_next',
			)
			assert.deepEqual(malformed, { status: 'malformed', file: 'mode' })

			// The same gist holds nothing at all for the other tab, which is a
			// different answer from "there is something here I cannot read".
			const missing = await fetchStoredAdviceAnalysisOutcomeForTab(
				't',
				'g',
				'portfolio_review',
			)
			assert.equal(missing.status, 'not_found')

			// The legacy file is shared by both modes, so a corrupt one is named as
			// such: it may hold either mode's analysis, or neither.
			globalThis.fetch = async () =>
				Response.json({
					files: { [ADVICE_STORAGE_FILENAME]: { content: '{"version": 1,' } },
				})
			assert.deepEqual(
				await fetchStoredAdviceAnalysisOutcomeForTab('t', 'g', 'buy_next'),
				{ status: 'malformed', file: 'legacy' },
			)

			globalThis.fetch = async () => new Response(null, { status: 401 })
			const unreadable = await fetchStoredAdviceAnalysisOutcomeForTab(
				't',
				'g',
				'buy_next',
			)
			assert.deepEqual(unreadable, { status: 'unreadable', httpStatus: 401 })
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	it('saveStoredAdviceAnalysisForTab PATCHes the mode-specific file', async () => {
		let capturedMethod: string | undefined
		let capturedBody: unknown
		await withStubbedFetch(
			(_input, init) => {
				capturedMethod = init?.method
				capturedBody = JSON.parse(String(init?.body))
				return new Response(null, { status: 200 })
			},
			async () => {
				await saveStoredAdviceAnalysisForTab(
					't',
					'g',
					'buy_next',
					sampleStoredAnalysis,
				)
			},
		)
		assert.equal(capturedMethod, 'PATCH')
		const files = (
			capturedBody as { files: Record<string, { content: string }> }
		).files
		assert.ok(files[ADVICE_BUY_NEXT_STORAGE_FILENAME])
		const savedPayload = JSON.parse(
			files[ADVICE_BUY_NEXT_STORAGE_FILENAME].content,
		)
		assert.equal(savedPayload.lastAnalysisMode, 'buy_next')
		assert.equal(savedPayload.document.blocks[0].text, 'Buy VTI.')
	})

	it('saveStoredAdviceAnalysisForTab throws with the status on a rejected write', async () => {
		await withStubbedFetch(
			() => new Response(null, { status: 422 }),
			async () => {
				await assert.rejects(
					saveStoredAdviceAnalysisForTab(
						't',
						'g',
						'buy_next',
						sampleStoredAnalysis,
					),
					/422/,
				)
			},
		)
	})

	it('clearStoredAdviceAnalysisForTab nulls only the mode-specific file', async () => {
		let capturedBody: unknown
		await withStubbedFetch(
			(_input, init) => {
				capturedBody = JSON.parse(String(init?.body))
				return new Response(null, { status: 200 })
			},
			async () => {
				await clearStoredAdviceAnalysisForTab('t', 'g', 'portfolio_review')
			},
		)
		assert.deepEqual(capturedBody, {
			files: { [ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME]: null },
		})
	})

	it('clearLegacyUnifiedAdviceAnalysis nulls only the legacy file', async () => {
		let capturedBody: unknown
		await withStubbedFetch(
			(_input, init) => {
				capturedBody = JSON.parse(String(init?.body))
				return new Response(null, { status: 200 })
			},
			async () => {
				await clearLegacyUnifiedAdviceAnalysis('t', 'g')
			},
		)
		assert.deepEqual(capturedBody, {
			files: { [ADVICE_STORAGE_FILENAME]: null },
		})
	})

	it('clearStoredAdviceAnalysis nulls all three files in one request', async () => {
		let capturedBody: unknown
		let requestCount = 0
		await withStubbedFetch(
			(_input, init) => {
				requestCount += 1
				capturedBody = JSON.parse(String(init?.body))
				return new Response(null, { status: 200 })
			},
			async () => {
				await clearStoredAdviceAnalysis('t', 'g')
			},
		)
		assert.equal(requestCount, 1)
		assert.deepEqual(capturedBody, {
			files: {
				[ADVICE_STORAGE_FILENAME]: null,
				[ADVICE_BUY_NEXT_STORAGE_FILENAME]: null,
				[ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME]: null,
			},
		})
	})
})
