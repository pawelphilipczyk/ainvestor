import { createCookie } from 'remix/cookie'
import { createCookieSessionStorage } from 'remix/session/cookie-storage'

export type SessionData = {
	token: string
	gistId: string | null
	login: string
}

/** Non-empty secret for cookie signing. Web Crypto rejects zero-length keys. */
function getSessionSecret(): string {
	const raw = (process.env.SESSION_SECRET ?? '').trim()
	return raw || 'dev-secret-change-me'
}

export const sessionCookie = createCookie('session', {
	httpOnly: true,
	sameSite: 'Lax',
	secrets: [getSessionSecret()],
	maxAge: 86400,
	secure: process.env.NODE_ENV === 'production',
})

export const sessionStorage = createCookieSessionStorage()
