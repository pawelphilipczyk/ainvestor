import * as assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../../features/catalog/lib.ts'
import { type EtfEntry, GIST_FILENAME } from '../gist.ts'
import { GUIDELINES_FILENAME } from '../guidelines.ts'
import {
	approvedSessionCookieForFakeRepo,
	resetTestSessionCookieJar,
	testSessionFetch,
} from '../test-session-fetch.ts'
import {
	type FakeDataRepo,
	installFakeDataRepo,
} from './github-repo-test-fake.ts'
import {
	MAX_WRITE_ATTEMPTS,
	setRetryPauseForTests,
} from './read-modify-write.ts'

/**
 * Two clients saving at once, seen from the web app: whichever saves second
 * must land on top of the first rather than over it. The other client is played
 * by the fake repo, which changes a file right after the controller reads it.
 */
// The pause between attempts is for real GitHub; the give-up cases would just sleep.
setRetryPauseForTests(0)

const originalFetch = globalThis.fetch

beforeEach(async () => {
	await approvedSessionCookieForFakeRepo()
})

afterEach(() => {
	globalThis.fetch = originalFetch
	resetTestSessionCookieJar()
	resetSharedCatalogForTests()
})

function post(url: string, fields: Record<string, string>, accept?: string) {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.set(key, value)
	return testSessionFetch(
		new Request(url, {
			method: 'POST',
			body: form,
			...(accept ? { headers: { Accept: accept } } : {}),
		}),
	)
}

function holding(id: string, overrides: Partial<EtfEntry> = {}): EtfEntry {
	return { id, name: `Fund ${id}`, value: 100, currency: 'PLN', ...overrides }
}

function guideline(id: string, etfType: string, targetPct: number) {
	return { id, kind: 'asset_class', etfName: '', targetPct, etfType }
}

/**
 * Right after `path` is read for the `nth` time, another client saves `content`
 * there.
 */
function otherClientSavesOnce(path: string, content: unknown) {
	let reads = 0
	return (readPath: string, repo: FakeDataRepo) => {
		if (readPath !== path) return
		reads += 1
		if (reads === 1) repo.externalWrite(path, JSON.stringify(content))
	}
}

const vti = {
	id: 't:VTI',
	ticker: 'VTI',
	name: 'VTI',
	type: 'equity',
	description: '',
} as const

describe('web concurrent writes', () => {
	it('adds a buy on top of a holding another client saved in between', async () => {
		setSharedCatalogForTests({ entries: [vti], ownerLogin: null })
		const repo = installFakeDataRepo({
			files: { [GIST_FILENAME]: JSON.stringify([holding('a')]) },
			afterContentRead: otherClientSavesOnce(GIST_FILENAME, [
				holding('a'),
				holding('theirs'),
			]),
		})

		const response = await post('http://localhost/portfolio', {
			portfolioIntent: 'trade',
			portfolioOperation: 'buy',
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'PLN',
		})

		assert.equal(response.status, 302)
		const stored = JSON.parse(
			repo.files.get(GIST_FILENAME) ?? '[]',
		) as EtfEntry[]
		// Both the other client's holding and this buy are there.
		assert.equal(stored.length, 3)
		assert.ok(stored.some((row) => row.id === 'a'))
		assert.ok(stored.some((row) => row.id === 'theirs'))
		assert.equal(stored.find((row) => row.ticker === 'VTI')?.value, 1000)
	})

	it('tells the user to reload when the portfolio keeps changing underneath the save', async () => {
		setSharedCatalogForTests({ entries: [vti], ownerLogin: null })
		const original = JSON.stringify([holding('a')])
		const repo = installFakeDataRepo({
			files: { [GIST_FILENAME]: original },
			afterContentRead: (path, fake) => {
				if (path === GIST_FILENAME) fake.externalWrite(path, original)
			},
		})

		const response = await post(
			'http://localhost/portfolio',
			{
				portfolioIntent: 'trade',
				portfolioOperation: 'buy',
				instrumentTicker: 'VTI',
				value: '1000',
				currency: 'PLN',
			},
			'application/json',
		)

		assert.equal(response.status, 422)
		const body = (await response.json()) as { error: string }
		assert.match(body.error, /changed elsewhere/)
		assert.match(body.error, /nothing was saved/)
		assert.deepEqual(repo.commitMessages, [])
		assert.equal(repo.files.get(GIST_FILENAME), original)
	})

	it('shows the holdings a refused sale was decided on', async () => {
		setSharedCatalogForTests({ entries: [vti], ownerLogin: null })
		installFakeDataRepo({
			files: {
				[GIST_FILENAME]: JSON.stringify([
					holding('a', { ticker: 'VTI', name: 'VTI', value: 100 }),
					holding('b', { name: 'Gold from the other client' }),
				]),
			},
		})

		const response = await post(
			'http://localhost/portfolio',
			{
				portfolioIntent: 'trade',
				portfolioOperation: 'sell',
				instrumentTicker: 'VTI',
				value: '150',
				currency: 'PLN',
			},
			'text/html',
		)

		assert.equal(response.status, 422)
		assert.match(await response.text(), /Gold from the other client/)
	})

	it('removes a holding on top of one another client added in between', async () => {
		const repo = installFakeDataRepo({
			files: {
				[GIST_FILENAME]: JSON.stringify([holding('drop'), holding('keep')]),
			},
			afterContentRead: otherClientSavesOnce(GIST_FILENAME, [
				holding('drop'),
				holding('keep'),
				holding('theirs'),
			]),
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio/drop', { method: 'DELETE' }),
		)

		const stored = JSON.parse(
			repo.files.get(GIST_FILENAME) ?? '[]',
		) as EtfEntry[]
		assert.deepEqual(stored.map((row) => row.id).sort(), ['keep', 'theirs'])
	})

	it('adds a guideline on top of one another client saved in between', async () => {
		const equity = guideline('equity', 'equity', 40)
		const repo = installFakeDataRepo({
			files: { [GUIDELINES_FILENAME]: JSON.stringify([equity]) },
			afterContentRead: otherClientSavesOnce(GUIDELINES_FILENAME, [
				equity,
				guideline('gold', 'commodity', 10),
			]),
		})

		await post('http://localhost/guidelines', {
			guidelineIntent: 'addAssetClass',
			assetClassType: 'bond',
			targetPct: '25',
		})

		const stored = JSON.parse(repo.files.get(GUIDELINES_FILENAME) ?? '[]') as {
			etfType: string
		}[]
		assert.deepEqual(stored.map((row) => row.etfType).sort(), [
			'bond',
			'commodity',
			'equity',
		])
	})

	it('checks the 100% cap again against what the other client saved', async () => {
		const equity = guideline('equity', 'equity', 40)
		// Alone, 40 + 55 fits; once the other client's 30 lands, it does not.
		const repo = installFakeDataRepo({
			files: { [GUIDELINES_FILENAME]: JSON.stringify([equity]) },
			afterContentRead: otherClientSavesOnce(GUIDELINES_FILENAME, [
				equity,
				guideline('gold', 'commodity', 30),
			]),
		})

		const response = await post(
			'http://localhost/guidelines',
			{
				guidelineIntent: 'addAssetClass',
				assetClassType: 'bond',
				targetPct: '55',
			},
			'application/json',
		)

		assert.equal(response.status, 422)
		assert.deepEqual(repo.commitMessages, [])
		const stored = JSON.parse(
			repo.files.get(GUIDELINES_FILENAME) ?? '[]',
		) as unknown[]
		assert.equal(stored.length, 2)
	})

	it(`gives up on a guideline after ${MAX_WRITE_ATTEMPTS} lost races, saying nothing was saved`, async () => {
		const original = JSON.stringify([guideline('equity', 'equity', 40)])
		const repo = installFakeDataRepo({
			files: { [GUIDELINES_FILENAME]: original },
			afterContentRead: (path, fake) => {
				if (path === GUIDELINES_FILENAME) fake.externalWrite(path, original)
			},
		})

		const response = await post(
			'http://localhost/guidelines',
			{
				guidelineIntent: 'addAssetClass',
				assetClassType: 'bond',
				targetPct: '25',
			},
			'application/json',
		)

		assert.equal(response.status, 422)
		const body = (await response.json()) as { error: string }
		assert.match(body.error, /changed elsewhere/)
		assert.deepEqual(repo.commitMessages, [])
	})
})
