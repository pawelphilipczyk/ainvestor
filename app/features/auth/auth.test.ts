import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { router } from '../../router.ts'

afterEach(() => {
	delete process.env.GH_CLIENT_ID
})

describe('GitHub OAuth routes', () => {
	it('GET /auth/github returns 500 when GH_CLIENT_ID is not set', async () => {
		const response = await router.fetch('http://localhost/auth/github')
		assert.equal(response.status, 500)
	})

	it('GET /auth/github redirects to GitHub when GH_CLIENT_ID is set', async () => {
		process.env.GH_CLIENT_ID = 'test-client-id'
		const response = await router.fetch('http://localhost/auth/github')

		assert.equal(response.status, 302)
		const location = response.headers.get('location') ?? ''
		assert.ok(location.startsWith('https://github.com/login/oauth/authorize'))
		assert.ok(location.includes('client_id=test-client-id'))
		assert.ok(location.includes('scope=gist'))
		const stateMatch = location.match(/(?:^|[?&])state=([^&]+)/)
		assert.ok(stateMatch, 'expected state query param on authorize URL')
		const stateValue = decodeURIComponent(stateMatch[1])
		assert.equal(stateValue.length, 64, 'expected 32-byte hex OAuth state')
		assert.match(response.headers.get('set-cookie') ?? '', /session=/i)
	})

	it('POST /auth/logout clears the session cookie and redirects home', async () => {
		const response = await router.fetch(
			new Request('http://localhost/auth/logout', { method: 'POST' }),
		)

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/')
		const setCookies = response.headers.getSetCookie?.() ?? []
		const joined =
			setCookies.length > 0
				? setCookies.join('\n')
				: (response.headers.get('set-cookie') ?? '')
		assert.ok(joined.includes('session=;') || joined.includes('Max-Age=0'))
		// Remix cookie encoding does not use a raw `=en` suffix (value is encoded).
		assert.match(joined, /ui_locale=/i)
	})
})
