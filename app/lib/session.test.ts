import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionCookie, sessionStorage } from './session.ts'

describe('session', () => {
	it('session cookie must be signed (has secrets)', async () => {
		assert.ok(sessionCookie.signed, 'session cookie must be signed')
	})

	it('round-trips session data through a signed cookie', async () => {
		const session = await sessionStorage.read(null)
		session.set('token', 'ghp_test')
		session.set('gistId', 'gist456')
		session.set('login', 'octocat')

		const value = await sessionStorage.save(session)
		assert.ok(value != null, 'dirty session should produce a save value')

		const header = await sessionCookie.serialize(value!)
		const parsed = await sessionCookie.parse(header)
		const session2 = await sessionStorage.read(parsed)

		assert.equal(session2.get('token'), 'ghp_test')
		assert.equal(session2.get('gistId'), 'gist456')
		assert.equal(session2.get('login'), 'octocat')
	})

	it('returns empty session when cookie value is null', async () => {
		const session = await sessionStorage.read(null)
		assert.equal(session.size, 0)
	})

	it('returns empty session for invalid cookie value', async () => {
		const session = await sessionStorage.read('not-valid-json')
		assert.equal(session.size, 0)
	})

	it('returns empty session when cookie has been tampered with', async () => {
		const session = await sessionStorage.read(null)
		session.set('token', 'ghp_test')
		const value = await sessionStorage.save(session)
		const header = await sessionCookie.serialize(value!)

		// Tamper: strip the HMAC signature
		const tamperedHeader = header.replace(/\.[^;]+/, '.XXXX')
		const parsed = await sessionCookie.parse(tamperedHeader)
		assert.equal(parsed, null, 'tampered cookie should not parse')
	})

	it('serialized cookie is HttpOnly', async () => {
		const session = await sessionStorage.read(null)
		session.set('token', 'test')
		const value = await sessionStorage.save(session)
		const header = await sessionCookie.serialize(value!)
		assert.ok(header.includes('HttpOnly'), 'cookie should be HttpOnly')
	})

	it('serialized cookie has SameSite=lax', async () => {
		const session = await sessionStorage.read(null)
		session.set('token', 'test')
		const value = await sessionStorage.save(session)
		const header = await sessionCookie.serialize(value!)
		assert.ok(
			header.toLowerCase().includes('samesite=lax'),
			'cookie should have SameSite=lax',
		)
	})

	it('destroyed session serializes to clear the cookie', async () => {
		const session = await sessionStorage.read(null)
		session.destroy()
		const value = await sessionStorage.save(session)
		assert.ok(value != null)
		const header = await sessionCookie.serialize(value!)
		assert.ok(
			header.includes('session=;') || header.includes('Max-Age=0'),
			'destroyed session should clear the cookie',
		)
	})
})
