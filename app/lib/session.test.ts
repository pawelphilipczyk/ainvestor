import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	getSessionData,
	getSessionIdentity,
	sessionCookie,
	sessionStorage,
	signOutPreCutoverSession,
} from './session.ts'

describe('session', () => {
	it('session cookie must be signed (has secrets)', async () => {
		assert.ok(sessionCookie.signed, 'session cookie must be signed')
	})

	it('round-trips session data through a signed cookie', async () => {
		const session = await sessionStorage.read(null)
		session.set('token', 'ghp_test')
		session.set('dataRepo', 'octocat/ainvestor-data')
		session.set('login', 'octocat')

		const value = await sessionStorage.save(session)
		if (value == null)
			throw new Error('dirty session should produce a save value')

		const header = await sessionCookie.serialize(value)
		const parsed = await sessionCookie.parse(header)
		const session2 = await sessionStorage.read(parsed)

		assert.equal(session2.get('token'), 'ghp_test')
		assert.equal(session2.get('dataRepo'), 'octocat/ainvestor-data')
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
		if (value == null) throw new Error('expected a save value')

		// Produce the signed Set-Cookie header, then tamper with the signature
		const header = await sessionCookie.serialize(value)
		const tamperedHeader = header.replace(/\.[^;]+/, '.XXXX')
		const parsed = await sessionCookie.parse(tamperedHeader)
		assert.equal(parsed, null, 'tampered cookie should not parse')
	})

	it('serialized cookie is HttpOnly', async () => {
		const session = await sessionStorage.read(null)
		session.set('token', 'test')
		const value = await sessionStorage.save(session)
		if (value == null) throw new Error('expected a save value')

		const header = await sessionCookie.serialize(value)
		assert.ok(header.includes('HttpOnly'), 'cookie should be HttpOnly')
	})

	it('serialized cookie has SameSite=lax', async () => {
		const session = await sessionStorage.read(null)
		session.set('token', 'test')
		const value = await sessionStorage.save(session)
		if (value == null) throw new Error('expected a save value')

		const header = await sessionCookie.serialize(value)
		assert.ok(
			header.toLowerCase().includes('samesite=lax'),
			'cookie should have SameSite=lax',
		)
	})

	it('destroyed session serializes to clear the cookie', async () => {
		const session = await sessionStorage.read(null)
		session.destroy()
		const value = await sessionStorage.save(session)
		if (value == null)
			throw new Error('expected a save value for destroyed session')

		const header = await sessionCookie.serialize(value)
		assert.ok(
			header.includes('session=;') || header.includes('Max-Age=0'),
			'destroyed session should clear the cookie',
		)
	})

	it('cookie signing works when SESSION_SECRET is empty (preview env)', async () => {
		const restore = process.env.SESSION_SECRET
		process.env.SESSION_SECRET = ''
		try {
			const mod = await import(`./session.ts?t=${Date.now()}` as `${string}.ts`)
			const session = await mod.sessionStorage.read(null)
			session.set('token', 'x')
			const value = await mod.sessionStorage.save(session)
			if (value == null) throw new Error('expected save value')
			const header = await mod.sessionCookie.serialize(value)
			assert.ok(header.length > 0, 'serialize must not throw with empty secret')
		} finally {
			process.env.SESSION_SECRET = restore
		}
	})
})

describe('signOutPreCutoverSession', () => {
	it('signs out a cookie still holding the pre-cutover gistId', async () => {
		const session = await sessionStorage.read(null)
		session.set('token', 'gist-only-token')
		session.set('gistId', 'abc123')
		session.set('login', 'octocat')
		session.set('isAdmin', true)
		signOutPreCutoverSession(session)
		assert.equal(getSessionIdentity(session), null)
		assert.equal(session.get('token'), undefined)
		assert.equal(session.get('gistId'), undefined)
		assert.equal(session.get('isAdmin'), undefined)
	})

	it('leaves a current session alone', async () => {
		const session = await sessionStorage.read(null)
		session.set('token', 'token')
		session.set('dataRepo', 'octocat/ainvestor-data')
		session.set('login', 'octocat')
		signOutPreCutoverSession(session)
		assert.deepEqual(getSessionData(session), {
			token: 'token',
			dataRepo: 'octocat/ainvestor-data',
			login: 'octocat',
		})
	})
})
