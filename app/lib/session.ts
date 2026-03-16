import { createCookie } from 'remix/cookie'
import { createCookieSessionStorage } from 'remix/session/cookie-storage'

export type SessionData = {
	token: string
	gistId: string | null
	login: string
}

export const sessionCookie = createCookie('session', {
	httpOnly: true,
	sameSite: 'Lax',
	secrets: [process.env.SESSION_SECRET ?? 'dev-secret-change-me'],
	maxAge: 86400,
	secure: process.env.NODE_ENV === 'production',
})

export const sessionStorage = createCookieSessionStorage()
