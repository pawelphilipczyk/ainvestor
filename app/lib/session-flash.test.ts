import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Session } from 'remix/session'
import { sessionCookie, sessionStorage } from './session.ts'
import { flashBanner, readFlashedBanner } from './session-flash.ts'

/** Round-trips a session through a signed cookie, simulating the next request. */
async function reload(session: Session): Promise<Session> {
	const value = await sessionStorage.save(session)
	if (value == null) return sessionStorage.read(null)
	const header = await sessionCookie.serialize(value)
	const parsed = await sessionCookie.parse(header)
	return sessionStorage.read(parsed)
}

describe('session-flash', () => {
	it('returns undefined when nothing was flashed', async () => {
		const session = await sessionStorage.read(null)
		assert.equal(readFlashedBanner(session), undefined)
	})

	it('is unreadable on the request that flashed it, readable on the next, and gone after that', async () => {
		let session = await sessionStorage.read(null)
		flashBanner(session, { text: 'Saved', tone: 'success' })
		assert.equal(readFlashedBanner(session), undefined)

		session = await reload(session)
		assert.deepEqual(readFlashedBanner(session), {
			text: 'Saved',
			tone: 'success',
		})

		session = await reload(session)
		assert.equal(readFlashedBanner(session), undefined)
	})

	it('carries the text and tone together across the same reload', async () => {
		let session = await sessionStorage.read(null)
		flashBanner(session, { text: 'Could not save', tone: 'error' })
		session = await reload(session)
		assert.deepEqual(readFlashedBanner(session), {
			text: 'Could not save',
			tone: 'error',
		})
	})

	it('falls back to info tone when the flashed tone is not a known value', async () => {
		let session = await sessionStorage.read(null)
		session.flash('message', 'Heads up')
		session.flash('messageTone', 'warning')
		session = await reload(session)
		assert.deepEqual(readFlashedBanner(session), {
			text: 'Heads up',
			tone: 'info',
		})
	})

	it('prefers a legacy "error" flash over the modern message/tone keys', async () => {
		let session = await sessionStorage.read(null)
		session.flash('error', 'Legacy failure')
		flashBanner(session, { text: 'Modern message', tone: 'success' })
		session = await reload(session)
		assert.deepEqual(readFlashedBanner(session), {
			text: 'Legacy failure',
			tone: 'error',
		})
	})

	it('treats an empty flashed message as absent', async () => {
		let session = await sessionStorage.read(null)
		session.flash('message', '')
		session = await reload(session)
		assert.equal(readFlashedBanner(session), undefined)
	})
})
