import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
	ETFS_FILENAME,
	fetchEtfs,
	parseEtfsFromFile,
	updateEtfs,
} from './etfs.ts'
import { installFakeDataRepo } from './store/github-repo-test-fake.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
})

describe('etfs', () => {
	it('exports the expected constants', () => {
		assert.equal(typeof ETFS_FILENAME, 'string')
	})

	it('parseEtfsFromFile returns empty array for a missing file', () => {
		assert.deepEqual(parseEtfsFromFile(null), [])
	})

	it('parseEtfsFromFile parses valid ETF JSON with new fields', () => {
		const entries = [
			{ id: 'abc-1', name: 'VTI', value: 1200.5, currency: 'USD' },
			{ id: 'abc-2', name: 'VWCE', value: 3400, currency: 'EUR' },
		]
		const result = parseEtfsFromFile(JSON.stringify(entries))
		assert.deepEqual(result, entries)
	})

	it('parseEtfsFromFile drops legacy quantity from stored JSON', () => {
		const raw = [
			{
				id: 'abc-1',
				name: 'VTI',
				value: 1000,
				currency: 'USD',
				quantity: 10,
			},
		]
		const result = parseEtfsFromFile(JSON.stringify(raw))
		assert.deepEqual(result, [
			{ id: 'abc-1', name: 'VTI', value: 1000, currency: 'USD' },
		])
	})

	it('parseEtfsFromFile returns empty array for invalid JSON', () => {
		const result = parseEtfsFromFile('not-json!!!')
		assert.deepEqual(result, [])
	})

	it('fetchEtfs throws when GitHub API returns an error status', async () => {
		const previousFetch = globalThis.fetch
		globalThis.fetch = async () =>
			new Response(null, { status: 403, statusText: 'Forbidden' })
		try {
			await assert.rejects(
				async () => fetchEtfs('token', 'octocat/ainvestor-data'),
				/GitHub API error fetching the portfolio: 403/,
			)
		} finally {
			globalThis.fetch = previousFetch
		}
	})

	it('updateEtfs throws with the status when GitHub refuses the save', async () => {
		installFakeDataRepo({
			files: { [ETFS_FILENAME]: '[]' },
			failWritesWith: 500,
		})
		await assert.rejects(
			updateEtfs({
				token: 'token',
				dataRepo: 'octocat/ainvestor-data',
				change: () => ({
					write: [{ id: 'a', name: 'X', value: 1, currency: 'PLN' }],
					message: 'Add X',
					result: null,
				}),
			}),
			/GitHub API error saving the portfolio: 500/,
		)
	})

	it('updateEtfs does not retry a 422 on an existing file, which is not a lost race', async () => {
		// A ruleset or a size limit refuses the save the same way every time.
		const repo = installFakeDataRepo({
			files: { [ETFS_FILENAME]: '[]' },
			failWritesWith: 422,
		})
		await assert.rejects(
			updateEtfs({
				token: 'token',
				dataRepo: 'octocat/ainvestor-data',
				change: () => ({
					write: [{ id: 'a', name: 'X', value: 1, currency: 'PLN' }],
					message: 'Add X',
					result: null,
				}),
			}),
			/GitHub API error saving the portfolio: 422/,
		)
		assert.equal(
			repo.requests.filter((request) => request.startsWith('PUT')).length,
			1,
		)
	})

	it('updateEtfs recreates the file when another client deleted it after the read', async () => {
		let deleted = false
		const repo = installFakeDataRepo({
			files: {
				[ETFS_FILENAME]: JSON.stringify([
					{ id: 'old', name: 'Old', value: 1, currency: 'PLN' },
				]),
			},
			afterContentRead: (path, fake) => {
				if (path !== ETFS_FILENAME || deleted) return
				deleted = true
				fake.externalDelete(ETFS_FILENAME)
			},
		})
		await updateEtfs({
			token: 'token',
			dataRepo: 'octocat/ainvestor-data',
			change: (current) => ({
				write: [
					...current,
					{ id: 'new', name: 'New', value: 2, currency: 'PLN' },
				],
				message: 'Add New',
				result: null,
			}),
		})
		// The retry saw no file, so the new row stands alone rather than reviving the old.
		const stored = JSON.parse(repo.files.get(ETFS_FILENAME) ?? '[]') as {
			id: string
		}[]
		assert.deepEqual(
			stored.map((holding) => holding.id),
			['new'],
		)
	})

	it('updateEtfs creates the file when it does not exist yet', async () => {
		const repo = installFakeDataRepo({})
		await updateEtfs({
			token: 'token',
			dataRepo: 'octocat/ainvestor-data',
			change: (current) => ({
				write: [...current, { id: 'a', name: 'X', value: 1, currency: 'PLN' }],
				message: 'Add X',
				result: null,
			}),
		})
		assert.deepEqual(repo.commitMessages, ['Add X'])
		assert.equal(JSON.parse(repo.files.get(ETFS_FILENAME) ?? '[]').length, 1)
	})

	it('updateEtfs redoes its change when another client created the file first', async () => {
		let created = false
		const repo = installFakeDataRepo({
			// The first read finds no file; before this save lands, another client creates it.
			afterContentRead: (path, fake) => {
				if (path !== ETFS_FILENAME || created) return
				created = true
				fake.externalWrite(
					ETFS_FILENAME,
					JSON.stringify([
						{ id: 'theirs', name: 'Y', value: 2, currency: 'PLN' },
					]),
				)
			},
		})
		await updateEtfs({
			token: 'token',
			dataRepo: 'octocat/ainvestor-data',
			change: (current) => ({
				write: [
					...current,
					{ id: 'mine', name: 'X', value: 1, currency: 'PLN' },
				],
				message: 'Add X',
				result: null,
			}),
		})
		const stored = JSON.parse(repo.files.get(ETFS_FILENAME) ?? '[]') as {
			id: string
		}[]
		assert.deepEqual(stored.map((holding) => holding.id).sort(), [
			'mine',
			'theirs',
		])
	})
})
