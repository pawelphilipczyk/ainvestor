import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { AdviceDocument } from '../../app/features/advice/advice-document.ts'
import {
	ADVICE_BUY_NEXT_STORAGE_FILENAME,
	ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME,
	ADVICE_STORAGE_FILENAME,
} from '../../app/features/advice/advice-gist.ts'
import type { GistCredentials } from '../data-gist.ts'
import { resetDataGistIdCache } from '../data-gist.ts'
import {
	createGetSavedAdviceTool,
	flattenAdviceDocumentToText,
} from './saved-advice.ts'

const credentials: GistCredentials = {
	githubToken: 'token-value',
	dataGistId: 'pinned-gist',
}

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	resetDataGistIdCache()
})

function storedAnalysis(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		version: 1,
		savedAt: 1_700_000_000_000,
		lastAnalysisMode: 'buy_next',
		cashCurrency: 'PLN',
		cashAmount: '5000',
		selectedModel: 'gpt-5.6-sol',
		document: { blocks: [{ type: 'paragraph', text: 'Buy more bonds.' }] },
		...overrides,
	}
}

/** Serve one gist payload, and record which URLs were asked for. */
function stubGist(files: Record<string, string>): string[] {
	const requestedUrls: string[] = []
	globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
		requestedUrls.push(String(input))
		return Response.json({
			files: Object.fromEntries(
				Object.entries(files).map(([name, content]) => [name, { content }]),
			),
		})
	}
	return requestedUrls
}

function stubGistFailure(status: number): void {
	globalThis.fetch = async () => new Response('nope', { status })
}

/** Call the tool and parse the JSON document it answers with. */
async function callTool(
	toolArguments: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
	const tool = createGetSavedAdviceTool(credentials)
	const result = await tool.handler(toolArguments)
	return JSON.parse(result.content[0].text) as Record<string, unknown>
}

describe('flattenAdviceDocumentToText', () => {
	it('renders every block type as lines a reader would have seen', () => {
		const document: AdviceDocument = {
			blocks: [
				{ type: 'paragraph', text: 'Bonds are light.' },
				{
					type: 'capital_snapshot',
					segments: [
						{
							role: 'holdings',
							label: 'Holdings',
							amount: 10_000,
							currency: 'PLN',
						},
						{ role: 'cash', label: 'Cash', amount: 5000, currency: 'PLN' },
					],
					postTotal: {
						label: 'After investing',
						amount: 15_000,
						currency: 'PLN',
					},
				},
				{
					type: 'guideline_bars',
					caption: 'vs targets',
					rows: [
						{
							label: 'Bond',
							targetPct: 40,
							currentPct: 25.555,
							postBuyPct: 38,
						},
						{
							label: 'Equity',
							targetPct: 60,
							currentPct: 74.445,
							postBuyPct: undefined,
						},
					],
				},
				{
					type: 'etf_proposals',
					rows: [
						{
							name: 'Bond fund',
							ticker: 'AGGH',
							catalogEntryId: 't:AGGH',
							amount: 2500,
							currency: 'PLN',
							note: 'closes the gap',
						},
						{
							name: 'Nameless fund',
							ticker: undefined,
							catalogEntryId: undefined,
							amount: undefined,
							currency: undefined,
							note: undefined,
						},
					],
				},
			],
		}

		const text = flattenAdviceDocumentToText(document)

		assert.match(text, /^Bonds are light\./)
		assert.match(text, /Holdings: 10000 PLN/)
		assert.match(text, /After investing: 15000 PLN/)
		assert.match(text, /Targets — vs targets:/)
		assert.match(text, /Bond: target 40%, now 25\.56%, after buying 38%/)
		// No postBuyPct on that row, so no trailing clause invented for it.
		assert.match(text, /Equity: target 60%, now 74\.44%\n/)
		assert.match(text, /Bond fund \(AGGH\): 2500 PLN — closes the gap/)
		assert.match(text, /- Nameless fund$/m)
		// Blocks are separated, not run together.
		assert.equal(text.includes('\n\n'), true)
		assert.equal(text.includes('"type"'), false)
	})

	it('marks an empty row list rather than leaving a bare heading', () => {
		const text = flattenAdviceDocumentToText({
			blocks: [{ type: 'etf_proposals', rows: [] }],
		})
		assert.equal(text, 'Proposed purchases:\n- (none)')
	})
})

describe('get_saved_advice', () => {
	it('returns the stored analysis as text, with when and what it was written for', async () => {
		stubGist({
			[ADVICE_BUY_NEXT_STORAGE_FILENAME]: JSON.stringify(storedAnalysis()),
		})

		const payload = await callTool({ mode: 'buy_next' })

		assert.equal(payload.available, true)
		assert.equal(payload.mode, 'buy_next')
		assert.equal(payload.savedAtIso, '2023-11-14T22:13:20.000Z')
		assert.equal(payload.cashAmount, '5000')
		assert.equal(payload.cashCurrency, 'PLN')
		assert.equal(payload.model, 'gpt-5.6-sol')
		assert.equal(payload.text, 'Buy more bonds.')
	})

	it('defaults to the buy-next analysis when no mode is named', async () => {
		stubGist({
			[ADVICE_BUY_NEXT_STORAGE_FILENAME]: JSON.stringify(storedAnalysis()),
		})
		assert.equal((await callTool()).mode, 'buy_next')
	})

	it('refuses a mode it does not have, rather than answering with the other one', async () => {
		const tool = createGetSavedAdviceTool(credentials)
		await assert.rejects(
			tool.handler({ mode: 'portfolio-review' }),
			/must be one of: buy_next, portfolio_review/,
		)
	})

	it('falls back to the legacy single-file snapshot', async () => {
		stubGist({
			[ADVICE_STORAGE_FILENAME]: JSON.stringify(
				storedAnalysis({
					lastAnalysisMode: 'portfolio_review',
					document: { blocks: [{ type: 'paragraph', text: 'Old review.' }] },
				}),
			),
		})

		const payload = await callTool({ mode: 'portfolio_review' })

		assert.equal(payload.available, true)
		assert.equal(payload.text, 'Old review.')
	})

	it('reports a missing analysis as not_found, and says who writes one', async () => {
		stubGist({})

		const payload = await callTool({ mode: 'portfolio_review' })

		assert.equal(payload.available, false)
		assert.equal(payload.blocker, 'not_found')
		assert.match(String(payload.reason), /web app/i)
		assert.equal('text' in payload, false)
	})

	it('does not read the other mode’s analysis as this one’s', async () => {
		stubGist({
			[ADVICE_BUY_NEXT_STORAGE_FILENAME]: JSON.stringify(storedAnalysis()),
		})

		const payload = await callTool({ mode: 'portfolio_review' })

		assert.equal(payload.available, false)
		assert.equal(payload.blocker, 'not_found')
	})

	it('separates a malformed stored file from a missing one', async () => {
		stubGist({
			[ADVICE_PORTFOLIO_REVIEW_STORAGE_FILENAME]: '{"version": 1, "oops"',
		})

		const payload = await callTool({ mode: 'portfolio_review' })

		assert.equal(payload.available, false)
		assert.equal(payload.blocker, 'malformed')
		assert.match(String(payload.reason), /does not match the format/i)
	})

	it('throws with the status when GitHub refuses the read', async () => {
		// Thrown rather than reported as "nothing saved": over HTTP the transport
		// turns a 401 into a challenge, which is what makes a client refresh.
		stubGistFailure(401)
		const tool = createGetSavedAdviceTool(credentials)
		await assert.rejects(tool.handler({}), /advice gist: 401/)
	})
})
