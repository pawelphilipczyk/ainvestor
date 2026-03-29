import { router } from '../router.ts'
import { clearGuestGuidelinesServerStore } from './guest-session-state.ts'

let testSessionCookie: string | undefined

/** Clears the in-memory session cookie jar (call from test afterEach). */
export function resetTestSessionCookieJar(): void {
	testSessionCookie = undefined
	/** Test-only teardown; also clears server-side guest guideline map (session holds ref only). */
	clearGuestGuidelinesServerStore()
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
 * `router.fetch` with a sticky session cookie so multi-step guest tests stay on
 * one browser session (isolated from other tests via resetTestSessionCookieJar).
 */
export async function testSessionFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const incomingRequest = new Request(input, init)
	const headers = new Headers(incomingRequest.headers)
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
