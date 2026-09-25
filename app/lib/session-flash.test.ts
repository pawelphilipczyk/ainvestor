import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionCookie, sessionStorage } from './session.ts'
import { flashBanner, readFlashedBanner } from './session-flash.ts'

describe('session flash', () => {
	it('flashed banner survives exactly one redirect, then is gone', async () => {
		const session1 = await sessionStorage.read(null)
		flashBanner(session1, { text: 'Could not save', tone: 'error' })
		const value1 = await sessionStorage.save(session1)
		if (value1 == null) throw new Error('expected a save value')
		const header1 = await sessionCookie.serialize(value1)

		const parsed2 = await sessionCookie.parse(header1)
		const session2 = await sessionStorage.read(parsed2)
		assert.deepEqual(readFlashedBanner(session2), {
			text: 'Could not save',
			tone: 'error',
		})
		const value2 = await sessionStorage.save(session2)
		const header2 =
			value2 == null ? header1 : await sessionCookie.serialize(value2)

		const parsed3 = await sessionCookie.parse(header2)
		const session3 = await sessionStorage.read(parsed3)
		assert.equal(readFlashedBanner(session3), undefined)
	})

	it('returns undefined when nothing was flashed', async () => {
		const session = await sessionStorage.read(null)
		assert.equal(readFlashedBanner(session), undefined)
	})

	it('defaults to info tone when the flashed tone is missing', async () => {
		const session1 = await sessionStorage.read(null)
		session1.flash('message', 'Heads up')
		const value1 = await sessionStorage.save(session1)
		if (value1 == null) throw new Error('expected a save value')
		const header1 = await sessionCookie.serialize(value1)

		const parsed2 = await sessionCookie.parse(header1)
		const session2 = await sessionStorage.read(parsed2)
		assert.deepEqual(readFlashedBanner(session2), {
			text: 'Heads up',
			tone: 'info',
		})
	})
})
