import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	MAX_WRITE_ATTEMPTS,
	readModifyWrite,
	WriteConflictError,
} from './read-modify-write.ts'

/** A one-value store whose writes fail with a conflict while `conflicts` lasts. */
function fakeStore(conflicts: number) {
	let value = 1
	let version = 1
	let remaining = conflicts
	const log = { reads: 0, writes: 0 }
	return {
		log,
		get value() {
			return value
		},
		read: async () => {
			log.reads += 1
			return { value, version: String(version) }
		},
		write: async (params: {
			value: number
			version: string | null
			message: string
		}) => {
			log.writes += 1
			if (remaining > 0) {
				remaining -= 1
				// Someone else saved first.
				value += 100
				version += 1
				throw new WriteConflictError('the number')
			}
			assert.equal(params.version, String(version))
			value = params.value
			version += 1
		},
	}
}

function addOne(store: ReturnType<typeof fakeStore>) {
	return readModifyWrite({
		what: 'the number',
		read: store.read,
		change: (current) => ({
			write: current + 1,
			message: 'Add one',
			result: current + 1,
		}),
		write: store.write,
	})
}

describe('readModifyWrite', () => {
	it('saves once when nothing else wrote in between', async () => {
		const store = fakeStore(0)
		assert.equal(await addOne(store), 2)
		assert.deepEqual(store.log, { reads: 1, writes: 1 })
	})

	it('redoes the change on the content the other writer left, rather than losing either', async () => {
		const store = fakeStore(1)
		// First attempt conflicts (the other writer made it 101); the retry adds to that.
		assert.equal(await addOne(store), 102)
		assert.equal(store.value, 102)
		assert.deepEqual(store.log, { reads: 2, writes: 2 })
	})

	it(`gives up with a conflict error after ${MAX_WRITE_ATTEMPTS} attempts`, async () => {
		const store = fakeStore(MAX_WRITE_ATTEMPTS)
		await assert.rejects(addOne(store), WriteConflictError)
		assert.equal(store.log.writes, MAX_WRITE_ATTEMPTS)
	})

	it('writes nothing when the change declines', async () => {
		const store = fakeStore(0)
		const result = await readModifyWrite({
			what: 'the number',
			read: store.read,
			change: () => ({ result: 'refused' }),
			write: store.write,
		})
		assert.equal(result, 'refused')
		assert.equal(store.log.writes, 0)
	})

	it('does not retry a failure that is not a conflict, since the write may have landed', async () => {
		const store = fakeStore(0)
		let writes = 0
		await assert.rejects(
			readModifyWrite({
				what: 'the number',
				read: store.read,
				change: (current) => ({
					write: current + 1,
					message: 'Add one',
					result: current + 1,
				}),
				write: async () => {
					writes += 1
					throw new Error('GitHub API error saving: 502')
				},
			}),
			/502/,
		)
		assert.equal(writes, 1)
	})
})
