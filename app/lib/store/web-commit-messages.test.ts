import * as assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { setAdviceClient } from '../../features/advice/advice-client.ts'
import {
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../../features/catalog/lib.ts'
import { GIST_FILENAME } from '../gist.ts'
import { GUIDELINES_FILENAME } from '../guidelines.ts'
import {
	approvedSessionCookieForFakeRepo,
	resetTestSessionCookieJar,
	testSessionFetch,
} from '../test-session-fetch.ts'
import { installFakeDataRepo } from './github-repo-test-fake.ts'

/**
 * What the web app commits to a user's data repo, as the history shows it.
 * Runs the real controllers against the fake repo rather than the in-process
 * overlay, because the overlay never reaches a commit.
 */
const originalFetch = globalThis.fetch

beforeEach(async () => {
	await approvedSessionCookieForFakeRepo()
})

afterEach(() => {
	setAdviceClient(null)
	globalThis.fetch = originalFetch
	resetTestSessionCookieJar()
	resetSharedCatalogForTests()
})

function formRequest(
	url: string,
	fields: Record<string, string>,
	method = 'POST',
): Request {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.set(key, value)
	return new Request(url, { method, body: form })
}

const guidelineRow = {
	id: 'g1',
	kind: 'asset_class',
	etfName: '',
	targetPct: 40,
	etfType: 'equity',
}

describe('web commit messages', () => {
	it('names a buy made in the portfolio form', async () => {
		setSharedCatalogForTests({
			entries: [
				{
					id: 't:VTI',
					ticker: 'VTI',
					name: 'VTI',
					type: 'equity',
					description: '',
				},
			],
			ownerLogin: null,
		})
		const repo = installFakeDataRepo({ login: 'octocat' })

		const response = await testSessionFetch(
			formRequest('http://localhost/portfolio', {
				portfolioIntent: 'trade',
				portfolioOperation: 'buy',
				instrumentTicker: 'vti',
				value: '1000',
				currency: 'PLN',
			}),
		)

		assert.equal(response.status, 302)
		assert.deepEqual(repo.commitMessages, ['Buy VTI: +1000 PLN (web)'])
	})

	it('names the holding a delete removed', async () => {
		const repo = installFakeDataRepo({
			files: {
				[GIST_FILENAME]: JSON.stringify([
					{ id: 'h1', name: 'Gold ETC', value: 10, currency: 'PLN' },
				]),
			},
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio/h1', { method: 'DELETE' }),
		)

		assert.deepEqual(repo.commitMessages, ['Remove holding Gold ETC (web)'])
	})

	it('names a guideline added, retargeted and removed', async () => {
		const repo = installFakeDataRepo({
			files: { [GUIDELINES_FILENAME]: JSON.stringify([guidelineRow]) },
		})
		const post = (fields: Record<string, string>) =>
			testSessionFetch(formRequest('http://localhost/guidelines', fields))

		await post({
			guidelineIntent: 'addAssetClass',
			assetClassType: 'bond',
			targetPct: '25',
		})
		await post({ guidelineIntent: 'updateTarget', id: 'g1', targetPct: '55' })
		await post({ guidelineIntent: 'delete', id: 'g1' })

		assert.deepEqual(repo.commitMessages, [
			'Add guideline bond class: 25% (web)',
			'Set guideline equity class: 55% (web)',
			'Remove guideline equity class (web)',
		])
	})

	it('names advice that was saved and then cleared', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: null })
		setAdviceClient({
			chat: {
				completions: {
					create: async () => ({
						choices: [
							{
								message: {
									content: JSON.stringify({
										blocks: [{ type: 'paragraph', text: 'Hold.' }],
									}),
								},
							},
						],
					}),
				},
			},
		})
		const repo = installFakeDataRepo({
			files: {
				[GIST_FILENAME]: JSON.stringify([
					{ id: 'h1', name: 'Gold ETC', value: 10, currency: 'PLN' },
				]),
				[GUIDELINES_FILENAME]: JSON.stringify([guidelineRow]),
			},
		})
		const post = (fields: Record<string, string>) =>
			testSessionFetch(formRequest('http://localhost/advice', fields))

		await post({ analysisMode: 'portfolio_review', adviceIntent: 'run' })
		await post({ analysisMode: 'portfolio_review', adviceIntent: 'clear' })

		assert.deepEqual(repo.commitMessages, [
			'Save portfolio-review advice (web)',
			'Clear portfolio-review advice (web)',
		])
	})
})
