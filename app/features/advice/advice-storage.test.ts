import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { installFakeDataRepo } from '../../lib/store/github-repo-test-fake.ts'
import { DEFAULT_ADVICE_MODEL } from './advice-openai.ts'
import {
	ADVICE_BUY_NEXT_STORAGE_FILENAME,
	ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME,
	ADVICE_STORAGE_FILENAME,
	clearLegacyUnifiedAdviceAnalysis,
	clearStoredAdviceAnalysis,
	clearStoredAdviceAnalysisForTab,
	fetchStoredAdviceAnalysisForTab,
	fetchStoredAdviceAnalysisOutcomeForTab,
	parseStoredAdviceAnalysisFromFile,
	resetAdviceStorageTestOverlay,
	type StoredAdviceAnalysis,
	saveStoredAdviceAnalysisForTab,
	setAdviceStorageTestOverlay,
} from './advice-storage.ts'

const originalFetch = globalThis.fetch
const TOKEN = 'token'
const REPO = 'octocat/ainvestor-data'

afterEach(() => {
	resetAdviceStorageTestOverlay()
	globalThis.fetch = originalFetch
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

describe('advice storage', () => {
	it('parseStoredAdviceAnalysisFromFile returns null for empty or invalid JSON', () => {
		assert.equal(parseStoredAdviceAnalysisFromFile(null), null)
		assert.equal(parseStoredAdviceAnalysisFromFile(''), null)
		assert.equal(parseStoredAdviceAnalysisFromFile('not json'), null)
	})

	it('parseStoredAdviceAnalysisFromFile accepts a minimal valid snapshot', () => {
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
		const parsed = parseStoredAdviceAnalysisFromFile(raw)
		assert.ok(parsed)
		assert.equal(parsed?.lastAnalysisMode, 'portfolio_review')
		assert.equal(parsed?.document.blocks[0]?.type, 'paragraph')
	})

	it('parseStoredAdviceAnalysisFromFile keeps snapshots saved under a retired model id', () => {
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
		const parsed = parseStoredAdviceAnalysisFromFile(raw)
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
		setAdviceStorageTestOverlay(buyNextStored)
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
		installFakeDataRepo({
			files: { [ADVICE_BUY_NEXT_STORAGE_FILENAME]: '{"version": 1,' },
		})
		assert.deepEqual(
			await fetchStoredAdviceAnalysisOutcomeForTab(TOKEN, REPO, 'buy_next'),
			{ status: 'malformed', file: 'mode' },
		)

		// The same repo holds nothing at all for the other tab, which is a
		// different answer from "there is something here I cannot read".
		const missing = await fetchStoredAdviceAnalysisOutcomeForTab(
			TOKEN,
			REPO,
			'portfolio_review',
		)
		assert.equal(missing.status, 'not_found')

		// The legacy file is shared by both modes, so a corrupt one is named as
		// such: it may hold either mode's analysis, or neither.
		installFakeDataRepo({
			files: { [ADVICE_STORAGE_FILENAME]: '{"version": 1,' },
		})
		assert.deepEqual(
			await fetchStoredAdviceAnalysisOutcomeForTab(TOKEN, REPO, 'buy_next'),
			{ status: 'malformed', file: 'legacy' },
		)

		installFakeDataRepo({ failWith: 401 })
		assert.deepEqual(
			await fetchStoredAdviceAnalysisOutcomeForTab(TOKEN, REPO, 'buy_next'),
			{ status: 'unreadable', httpStatus: 401 },
		)
	})

	it('saveStoredAdviceAnalysisForTab writes the mode-specific file', async () => {
		const repo = installFakeDataRepo()
		await saveStoredAdviceAnalysisForTab(
			TOKEN,
			REPO,
			'buy_next',
			sampleStoredAnalysis,
		)
		const saved = JSON.parse(
			repo.files.get(ADVICE_BUY_NEXT_STORAGE_FILENAME) ?? 'null',
		)
		assert.equal(saved.lastAnalysisMode, 'buy_next')
		assert.equal(saved.document.blocks[0].text, 'Buy VTI.')
		assert.equal(
			repo.files.has(ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME),
			false,
		)
	})

	it('saveStoredAdviceAnalysisForTab throws with the status on a rejected write', async () => {
		installFakeDataRepo({ failWritesWith: 422 })
		await assert.rejects(
			saveStoredAdviceAnalysisForTab(
				TOKEN,
				REPO,
				'buy_next',
				sampleStoredAnalysis,
			),
			/422/,
		)
	})

	it('clearStoredAdviceAnalysisForTab removes only the mode-specific file', async () => {
		const repo = installFakeDataRepo({
			files: {
				[ADVICE_BUY_NEXT_STORAGE_FILENAME]: '{}',
				[ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME]: '{}',
			},
		})
		await clearStoredAdviceAnalysisForTab(TOKEN, REPO, 'portfolio_review')
		assert.equal(
			repo.files.has(ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME),
			false,
		)
		assert.equal(repo.files.has(ADVICE_BUY_NEXT_STORAGE_FILENAME), true)
	})

	it('clearLegacyUnifiedAdviceAnalysis removes only the legacy file', async () => {
		const repo = installFakeDataRepo({
			files: {
				[ADVICE_STORAGE_FILENAME]: '{}',
				[ADVICE_BUY_NEXT_STORAGE_FILENAME]: '{}',
			},
		})
		await clearLegacyUnifiedAdviceAnalysis(TOKEN, REPO)
		assert.equal(repo.files.has(ADVICE_STORAGE_FILENAME), false)
		assert.equal(repo.files.has(ADVICE_BUY_NEXT_STORAGE_FILENAME), true)
	})

	it('clearStoredAdviceAnalysis removes all three files in one commit', async () => {
		const repo = installFakeDataRepo({
			files: {
				[ADVICE_STORAGE_FILENAME]: '{}',
				[ADVICE_BUY_NEXT_STORAGE_FILENAME]: '{}',
				[ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME]: '{}',
			},
		})
		await clearStoredAdviceAnalysis(TOKEN, REPO)
		for (const file of [
			ADVICE_STORAGE_FILENAME,
			ADVICE_BUY_NEXT_STORAGE_FILENAME,
			ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME,
		]) {
			assert.equal(repo.files.has(file), false, file)
		}
		assert.equal(
			repo.requests.filter((request) => request.startsWith('PATCH ')).length,
			1,
		)
	})
})
