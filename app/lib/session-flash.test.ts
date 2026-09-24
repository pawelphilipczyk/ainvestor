import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionStorage } from './session.ts'
import { flashBanner, readFlashedBanner } from './session-flash.ts'

describe('session-flash', () => {
	it('is not readable on the same session instance before it is saved and reread', async () => {
		const session = await sessionStorage.read(null)
		flashBanner(session, { text: 'Saved!', tone: 'success' })
		assert.equal(readFlashedBanner(session), undefined)
	})

	it('is readable on the next request for each tone', async () => {
		for (const tone of ['error', 'info', 'success'] as const) {
			const session = await sessionStorage.read(null)
			flashBanner(session, { text: `flashed ${tone}`, tone })
			const value = await sessionStorage.save(session)
			const nextSession = await sessionStorage.read(value)
			assert.deepEqual(readFlashedBanner(nextSession), {
				text: `flashed ${tone}`,
				tone,
			})
		}
	})

	it('is gone by the request after the one that reads it', async () => {
		const session = await sessionStorage.read(null)
		flashBanner(session, { text: 'Saved!', tone: 'success' })

		const afterFlash = await sessionStorage.save(session)
		const nextRequestSession = await sessionStorage.read(afterFlash)
		assert.deepEqual(readFlashedBanner(nextRequestSession), {
			text: 'Saved!',
			tone: 'success',
		})

		// Simulate that next request completing without re-flashing anything.
		const afterNextRequest = await sessionStorage.save(nextRequestSession)
		const followingRequestSession = await sessionStorage.read(afterNextRequest)
		assert.equal(readFlashedBanner(followingRequestSession), undefined)
	})

	it('falls back to the legacy "error" key', async () => {
		const session = await sessionStorage.read(null)
		session.set('error', 'Something went wrong')
		assert.deepEqual(readFlashedBanner(session), {
			text: 'Something went wrong',
			tone: 'error',
		})
	})

	it('returns undefined when nothing was flashed', async () => {
		const session = await sessionStorage.read(null)
		assert.equal(readFlashedBanner(session), undefined)
	})

	it('treats an empty flashed message as no banner', async () => {
		const session = await sessionStorage.read(null)
		flashBanner(session, { text: '', tone: 'success' })
		const value = await sessionStorage.save(session)
		const nextSession = await sessionStorage.read(value)
		assert.equal(readFlashedBanner(nextSession), undefined)
	})

	it('defaults to the "info" tone when the tone is missing or invalid', async () => {
		const session = await sessionStorage.read(null)
		session.flash('message', 'no tone set')
		const value = await sessionStorage.save(session)
		const nextSession = await sessionStorage.read(value)
		assert.deepEqual(readFlashedBanner(nextSession), {
			text: 'no tone set',
			tone: 'info',
		})
	})
})
