import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { sessionCookie, sessionStorage } from '../../lib/session.ts'
import { readFlashedBanner } from '../../lib/session-flash.ts'
import { installFakeDataRepo } from '../../lib/store/github-repo-test-fake.ts'
import { router } from '../../router.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
	delete process.env.GH_CLIENT_ID
	delete process.env.APPROVED_GITHUB_LOGINS
	globalThis.fetch = originalFetch
})

/**
 * Runs the OAuth round trip against a fake GitHub: starts sign-in to get the
 * state and session cookie, then hits the callback with them. Returns the
 * session the callback left behind.
 */
async function signInThroughCallback(
	repoOptions: Parameters<typeof installFakeDataRepo>[0],
) {
	process.env.GH_CLIENT_ID = 'test-client-id'
	process.env.APPROVED_GITHUB_LOGINS = 'octocat'
	const start = await router.fetch('http://localhost/auth/github')
	const state =
		new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? ''
	const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0] ?? ''

	installFakeDataRepo(repoOptions)
	const repoFetch = globalThis.fetch
	globalThis.fetch = async (input, init) =>
		String(input) === 'https://github.com/login/oauth/access_token'
			? Response.json({ access_token: 'new-token' })
			: repoFetch(input, init)

	const response = await router.fetch(
		new Request(
			`http://localhost/auth/github/callback?code=code&state=${state}`,
			{ headers: { cookie } },
		),
	)
	const setCookie = response.headers.get('set-cookie') ?? ''
	const session = await sessionStorage.read(
		await sessionCookie.parse(setCookie.split(';')[0] ?? ''),
	)
	return { response, session }
}

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
		assert.equal(new URL(location).searchParams.get('scope'), 'gist repo')
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

	it('callback signs in with the data repo stored in the session', async () => {
		const { response, session } = await signInThroughCallback({})
		assert.equal(response.status, 302)
		assert.equal(session.get('token'), 'new-token')
		assert.equal(session.get('dataRepo'), 'octocat/ainvestor-data')
		assert.equal(readFlashedBanner(session), undefined)
	})

	it('callback names a same-named repo this app did not create, without a 500', async () => {
		const { response, session } = await signInThroughCallback({
			unmarked: true,
		})
		assert.equal(response.status, 302)
		assert.equal(session.get('token'), 'new-token')
		assert.equal(session.get('dataRepo'), undefined)
		const banner = readFlashedBanner(session)
		assert.equal(banner?.tone, 'error')
		assert.match(banner?.text ?? '', /octocat\/ainvestor-data/)
		assert.match(banner?.text ?? '', /Rename or delete it/)
	})
})
