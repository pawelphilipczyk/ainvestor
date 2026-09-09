import { createCookie } from 'remix/cookie'
import type { Session } from 'remix/session'
import { createCookieSessionStorage } from 'remix/session/cookie-storage'

export type SessionData = {
	/** GitHub OAuth token; null when signed in but pending allowlist approval. */
	token: string | null
	gistId: string | null
	login: string
	isAdmin?: boolean
	/** Present when login allowlist is active and this login is not on the list. */
	approvalStatus?: 'pending'
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
	if (!login || !token) return null
	const approvalStatus = session.get('approvalStatus') as 'pending' | undefined
	return {
		token,
		gistId: (session.get('gistId') as string | undefined) ?? null,
		login,
		...(session.get('isAdmin') === true ? { isAdmin: true } : {}),
		...(approvalStatus === 'pending' ? { approvalStatus: 'pending' } : {}),
	}
}

/** Signed in with GitHub (including pending approval) — has `login` but may lack `token`. */
export function getSessionIdentity(
	session: Session,
): Pick<SessionData, 'login' | 'approvalStatus'> | null {
	const login = session.get('login') as string | undefined
	if (!login) return null
	const approvalStatus = session.get('approvalStatus') as 'pending' | undefined
	return {
		login,
		...(approvalStatus === 'pending' ? { approvalStatus: 'pending' } : {}),
	}
}

/** Session for layout (nav, shell): approved user, or pending-approval identity. */
export function getLayoutSession(session: Session): SessionData | null {
	const full = getSessionData(session)
	if (full) return full
	const identity = getSessionIdentity(session)
	if (!identity) return null
	return {
		token: null,
		gistId: null,
		login: identity.login,
		...(session.get('isAdmin') === true ? { isAdmin: true } : {}),
		...(identity.approvalStatus === 'pending'
			? { approvalStatus: 'pending' }
			: {}),
	}
}

/** Session with a GitHub token and private data gist (not guest, not pending-only identity). */
export type SessionWithGithubGist = SessionData & {
	token: string
	gistId: string
}

/** True when the session can read/write the private GitHub Gist (not guest, not pending). */
export function sessionUsesGithubGist(
	session: SessionData | null,
): session is SessionWithGithubGist {
	return Boolean(session?.token && session.gistId)
}
