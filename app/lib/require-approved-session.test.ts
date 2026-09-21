import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { router } from '../router.ts'
import { requiresSignIn } from './require-approved-session-middleware.ts'
import {
	approvedSessionCookie,
	pendingSessionCookie,
	resetTestSessionCookieJar,
} from './test-session-fetch.ts'

afterEach(() => {
	resetTestSessionCookieJar()
})

/** Every page the app serves to a browser, and so everything the gate covers. */
const PROTECTED_PATHS = [
	'/portfolio',
	'/portfolio/some-id',
	'/guidelines',
	'/catalog',
	'/catalog/etf/some-entry',
	'/advice',
	'/admin/etf-import',
	'/fragments/portfolio-list',
	'/fragments/guidelines-list',
	'/fragments/advice-result',
]

/** Reachable signed out: the intro page, the auth handshake, and machine routes. */
const UNPROTECTED_PATHS = [
	'/',
	'/health',
	'/locale',
	'/mcp',
	'/auth/github',
	'/auth/github/callback',
	'/.well-known/oauth-protected-resource',
]

describe('sign-in gate path classification', () => {
	for (const path of PROTECTED_PATHS) {
		it(`${path} requires a sign-in`, () => {
			assert.equal(requiresSignIn(path), true)
		})
	}

	for (const path of UNPROTECTED_PATHS) {
		it(`${path} does not require a sign-in`, () => {
			assert.equal(requiresSignIn(path), false)
		})
	}

	it('a prefix match alone is not enough', () => {
		// `/catalogue` is not `/catalog`, and must not inherit its protection.
		assert.equal(requiresSignIn('/catalogue'), false)
		assert.equal(requiresSignIn('/portfolio-export'), false)
	})
})

describe('sign-in gate', () => {
	for (const path of PROTECTED_PATHS) {
		it(`GET ${path} redirects a signed-out visitor to the intro page`, async () => {
			const response = await router.fetch(`http://localhost${path}`)
			assert.equal(response.status, 302, `GET ${path}`)
			assert.equal(response.headers.get('location'), '/')
		})
	}

	it('leaves an unknown path as a 404 rather than a redirect', async () => {
		// A catch-all gate would answer 302 here and hide every genuine miss.
		const response = await router.fetch(
			'http://localhost/components/theme-toggle.island.js',
		)
		assert.equal(response.status, 404)
	})

	it('serves the intro page to a signed-out visitor', async () => {
		const response = await router.fetch('http://localhost/')
		assert.equal(response.status, 200)
	})

	it('lets an approved session through', async () => {
		const cookie = await approvedSessionCookie()
		const response = await router.fetch('http://localhost/portfolio', {
			headers: { Cookie: cookie },
		})
		assert.equal(response.status, 200)
	})

	// The state most easily broken by removing guest mode: signed in, token
	// stripped by `enforceGithubApproval`, so it looks tokenless like a guest —
	// but it must reach the page and see its own pending notice.
	it('lets a session pending approval through to its pending notice', async () => {
		const cookie = await pendingSessionCookie()
		const response = await router.fetch('http://localhost/portfolio', {
			headers: { Cookie: cookie },
		})
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Account pending approval/)
	})

	it('renders no holdings for a session pending approval', async () => {
		const cookie = await pendingSessionCookie()
		const response = await router.fetch(
			'http://localhost/fragments/portfolio-list',
			{ headers: { Cookie: cookie } },
		)
		assert.equal(response.status, 200)
	})
})
