import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createSessionCookie, parseSessionCookie } from './session.ts'

const secret = 'test-secret-32-chars-long-enough!'

describe('session', () => {
	it('round-trips session data through a signed cookie', async () => {
		const data = { token: 'gho_abc123', gistId: 'gist456', login: 'octocat' }
		const cookie = await createSessionCookie(data, secret)

		assert.ok(typeof cookie === 'string')
		assert.ok(cookie.length > 0)

		const parsed = await parseSessionCookie(cookie, secret)
		assert.deepEqual(parsed, data)
	})

	it('returns null when the signature is tampered with', async () => {
		const data = { token: 'gho_abc123', gistId: 'gist456', login: 'octocat' }
		const setCookie = await createSessionCookie(data, secret)
		// Extract just the raw cookie value (between "session=" and the first ";")
		const value = setCookie.split('=').slice(1).join('=').split(';')[0]
		// Tamper with the last 4 characters of the value (the signature portion)
		const tampered = `${value.slice(0, -4)}XXXX`

		const parsed = await parseSessionCookie(`session=${tampered}`, secret)
		assert.equal(parsed, null)
	})

	it('returns null for an empty or missing cookie header', async () => {
		assert.equal(await parseSessionCookie('', secret), null)
		assert.equal(await parseSessionCookie(undefined, secret), null)
	})

	it('returns null when no session cookie is present among other cookies', async () => {
		const result = await parseSessionCookie('foo=bar; baz=qux', secret)
		assert.equal(result, null)
	})

	it('parses the session cookie among multiple cookies', async () => {
		const data = { token: 't', gistId: 'g', login: 'u' }
		const sessionValue = await createSessionCookie(data, secret)
		// createSessionCookie returns just the Set-Cookie header value; extract the value part
		const cookieValue = sessionValue.split('=').slice(1).join('=').split(';')[0]
		const fullHeader = `other=abc; session=${cookieValue}; another=xyz`

		const parsed = await parseSessionCookie(fullHeader, secret)
		assert.deepEqual(parsed, data)
	})
})
