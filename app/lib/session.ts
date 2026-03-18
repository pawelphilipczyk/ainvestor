import { createCookie } from 'remix/cookie'
import type { Session } from 'remix/session'
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

/** Read typed session data from the middleware-injected Session. */
export function getSessionData(session: Session): SessionData | null {
	const token = session.get('token') as string | undefined
	const login = session.get('login') as string | undefined
	if (!token || !login) return null
	return {
		token,
		gistId: (session.get('gistId') as string | undefined) ?? null,
		login,
	}
}
