import { createCookie } from 'remix/cookie'
import type { Session } from 'remix/session'
import { createCookieSessionStorage } from 'remix/session-storage/cookie'

export type SessionData = {
	/** GitHub OAuth token; null when signed in but pending allowlist approval. */
	token: string | null
	/** The private data repo, `"owner/repo"`; null when sign-in could not resolve it. */
	dataRepo: string | null
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
		dataRepo: (session.get('dataRepo') as string | undefined) ?? null,
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
		dataRepo: null,
		login: identity.login,
		...(session.get('isAdmin') === true ? { isAdmin: true } : {}),
		...(identity.approvalStatus === 'pending'
			? { approvalStatus: 'pending' }
			: {}),
	}
}

/** Session with a GitHub token and a private data repo (not pending-only identity). */
export type SessionWithDataRepo = SessionData & {
	token: string
	dataRepo: string
}

/** True when the session can read/write the private data repo (not pending). */
export function sessionHasDataRepo(
	session: SessionData | null,
): session is SessionWithDataRepo {
	return Boolean(session?.token && session.dataRepo)
}

/**
 * Signs out a session from before the storage cutover. Such a cookie carries
 * the old `gistId` key and a token granted only the `gist` scope, which cannot
 * reach a private repo — so rather than leave it signed in against storage it
 * cannot read, it is cleared, and the next page sends the user through sign-in
 * for the new scope. Cookies expire within a day, so this has little to do for
 * long; it can go once the gist backend does.
 */
export function signOutPreCutoverSession(session: Session): void {
	if (session.get('gistId') === undefined) return
	for (const key of ['token', 'gistId', 'login', 'isAdmin', 'approvalStatus']) {
		session.unset(key)
	}
}
