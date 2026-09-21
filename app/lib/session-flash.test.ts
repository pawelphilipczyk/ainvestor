import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Session } from 'remix/session'

import { sessionCookie, sessionStorage } from './session.ts'
import { flashBanner, readFlashedBanner } from './session-flash.ts'

/** `session.flash()` is only visible after a save + reload, like a real redirect. */
async function roundTrip(session: Session): Promise<Session> {
	const value = await sessionStorage.save(session)
	const header =
		value == null ? undefined : await sessionCookie.serialize(value)
	const parsed = header == null ? null : await sessionCookie.parse(header)
	return sessionStorage.read(parsed)
}

describe('session-flash', () => {
	it('returns undefined when nothing was flashed', async () => {
		const session = await sessionStorage.read(null)
		assert.equal(readFlashedBanner(session), undefined)
	})

	it('reads back a banner flashed on the previous request', async () => {
		const session = await sessionStorage.read(null)
		flashBanner(session, { text: 'Saved', tone: 'success' })
		const next = await roundTrip(session)
		assert.deepEqual(readFlashedBanner(next), {
			text: 'Saved',
			tone: 'success',
		})
	})

	it('falls back to the legacy "error" key when present', async () => {
		const session = await sessionStorage.read(null)
		session.set('error', 'legacy failure text')
		assert.deepEqual(readFlashedBanner(session), {
			text: 'legacy failure text',
			tone: 'error',
		})
	})

	it('prefers the legacy "error" key over a flashed banner', async () => {
		const session = await sessionStorage.read(null)
		session.set('error', 'legacy failure text')
		flashBanner(session, { text: 'Saved', tone: 'success' })
		assert.deepEqual(readFlashedBanner(session), {
			text: 'legacy failure text',
			tone: 'error',
		})
	})

	it('treats an empty legacy "error" value as no banner', async () => {
		const session = await sessionStorage.read(null)
		session.set('error', '')
		assert.equal(readFlashedBanner(session), undefined)
	})

	it('defaults an unrecognised tone to "info"', async () => {
		const session = await sessionStorage.read(null)
		session.flash('message', 'Something happened')
		session.flash('messageTone', 'bogus-tone')
		const next = await roundTrip(session)
		assert.deepEqual(readFlashedBanner(next), {
			text: 'Something happened',
			tone: 'info',
		})
	})

	it('treats an empty flashed message as no banner', async () => {
		const session = await sessionStorage.read(null)
		session.flash('message', '')
		session.flash('messageTone', 'error')
		const next = await roundTrip(session)
		assert.equal(readFlashedBanner(next), undefined)
	})

	it('survives exactly one redirect, then is gone on the request after', async () => {
		const session1 = await sessionStorage.read(null)
		flashBanner(session1, { text: 'ETF added', tone: 'success' })

		// Next request (the redirect target): the banner is readable.
		const session2 = await roundTrip(session1)
		assert.deepEqual(readFlashedBanner(session2), {
			text: 'ETF added',
			tone: 'success',
		})

		// The request after that: the banner must not still be showing.
		const session3 = await roundTrip(session2)
		assert.equal(readFlashedBanner(session3), undefined)
	})
})
