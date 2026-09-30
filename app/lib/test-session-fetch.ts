import { router } from '../router.ts'
import {
	ensurePrivateGistTestStore,
	setPrivateGistTestStore,
	TEST_GIST_ID,
	TEST_TOKEN,
} from './private-gist-test-store.ts'
import { sessionCookie, sessionStorage } from './session.ts'

let testSessionCookie: string | undefined

/** POST /catalog/import with `bankApiJson` (matches browser form after formData() middleware). */
export function catalogImportFormRequest(bankJson: string): Request {
	const formData = new FormData()
	formData.set('bankApiJson', bankJson)
	return new Request('http://localhost/catalog/import', {
		method: 'POST',
		body: formData,
	})
}

/** Clears the in-memory session cookie jar (call from test afterEach). */
export function resetTestSessionCookieJar(): void {
	testSessionCookie = undefined
	setPrivateGistTestStore(null)
}

/** Adds one login to `APPROVED_GITHUB_LOGINS`, keeping any already listed. */
function addApprovedGithubLogin(login: string): void {
	const listed = (process.env.APPROVED_GITHUB_LOGINS ?? '')
		.split(/[\s,]+/)
		.filter((entry) => entry.length > 0)
	if (listed.includes(login)) return
	process.env.APPROVED_GITHUB_LOGINS = [...listed, login].join(',')
}

/** Test-only: make `testSessionFetch` send this session from now on. */
export function seedTestSessionCookie(cookie: string): void {
	testSessionCookie = cookie
}

async function seedSessionCookie(
	fill: (session: Awaited<ReturnType<typeof sessionStorage.read>>) => void,
): Promise<string> {
	const session = await sessionStorage.read(null)
	fill(session)
	const value = await sessionStorage.save(session)
	if (value == null) throw new Error('expected session save value')
	const header = await sessionCookie.serialize(value)
	const cookie = header.split(';')[0] ?? ''
	// Seed the sticky jar too, so `testSessionFetch` callers need no header.
	testSessionCookie = cookie
	return cookie
}

/**
 * Test-only: an approved session holding a private gist, with
 * `fetchEtfs` / `fetchGuidelines` answered from the in-process overlay so no
 * request reaches GitHub. Every page behind the sign-in gate needs one.
 */
export async function approvedSessionCookie(
	login = 'test-user',
): Promise<string> {
	// Both are additive on purpose. `browser-test.ts` calls this for every page
	// it opens, and a suite that approved its own login or seeded its own rows
	// beforehand must not have either wiped out from under it.
	addApprovedGithubLogin(login)
	ensurePrivateGistTestStore()
	return seedSessionCookie((session) => {
		session.set('login', login)
		session.set('token', TEST_TOKEN)
		session.set('gistId', TEST_GIST_ID)
	})
}

/**
 * Test-only: signed in with GitHub but **not** on the allowlist, so
 * `enforceGithubApproval` strips the token and the pending state renders.
 * Distinct from signed out, which the gate redirects away.
 */
export async function pendingSessionCookie(
	login = 'pending-user',
): Promise<string> {
	process.env.APPROVED_GITHUB_LOGINS = 'somebody-else'
	return seedSessionCookie((session) => {
		session.set('login', login)
		session.set('token', TEST_TOKEN)
		session.set('gistId', TEST_GIST_ID)
	})
}

function applySetCookie(response: Response): void {
	const anyHeaders = response.headers as Headers & {
		getSetCookie?: () => string[]
	}
	const lines =
		typeof anyHeaders.getSetCookie === 'function'
			? anyHeaders.getSetCookie()
			: []
	if (lines.length > 0) {
		for (const line of lines) {
			if (line.startsWith('session=')) {
				testSessionCookie = line.split(';')[0]
				return
			}
		}
		return
	}
	const single = response.headers.get('Set-Cookie')
	if (single?.startsWith('session=')) {
		testSessionCookie = single.split(';')[0]
	}
}

/**
 * `router.fetch` with a sticky session cookie so multi-step tests stay on one
 * browser session (isolated from other tests via resetTestSessionCookieJar).
 */
export async function testSessionFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const incomingRequest = new Request(input, init)
	const headers = new Headers(incomingRequest.headers)
	// The jar wins over an explicit Cookie on purpose: it carries session
	// mutations (flash messages) forward across a test's later requests, which
	// a cookie captured at sign-in time would not. A test that signs in as
	// somebody else seeds the jar through `seedTestSessionCookie`.
	if (testSessionCookie) {
		headers.set('Cookie', testSessionCookie)
	}
	const nextInit: RequestInit & { duplex?: 'half' } = {
		method: incomingRequest.method,
		headers,
		redirect: incomingRequest.redirect,
		signal: incomingRequest.signal,
	}
	if (incomingRequest.body) {
		nextInit.body = incomingRequest.body
		nextInit.duplex = 'half'
	}
	const forwarded = new Request(incomingRequest.url, nextInit)
	const response = await router.fetch(forwarded)
	applySetCookie(response)
	return response
}
