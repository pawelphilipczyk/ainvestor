import type { Session } from 'remix/session'

/**
 * Optional GitHub login allowlist. When `APPROVED_GITHUB_LOGINS` is non-empty,
 * only those logins are treated as fully signed in for app features (gist, etc.).
 */
export function parseApprovedGithubLogins(): Set<string> | null {
	const raw = (process.env.APPROVED_GITHUB_LOGINS ?? '').trim()
	if (!raw) return null
	const set = new Set<string>()
	for (const part of raw.split(/[\s,]+/)) {
		if (part.length > 0) set.add(part.toLowerCase())
	}
	return set.size > 0 ? set : null
}

export function isGithubLoginApprovalEnforced(): boolean {
	return parseApprovedGithubLogins() !== null
}

export function isGithubLoginApproved(login: string): boolean {
	const allowed = parseApprovedGithubLogins()
	if (!allowed) return true
	return allowed.has(login.trim().toLowerCase())
}

/**
 * If the allowlist is active and the session user is not on it, drop GitHub
 * credentials so we never use a token for a demoted or unapproved account.
 */
export function stripGithubTokenIfUnapproved(session: Session): void {
	const login = session.get('login') as string | undefined
	const token = session.get('token') as string | undefined
	if (!login || !token || !isGithubLoginApprovalEnforced()) return
	if (isGithubLoginApproved(login)) return
	session.unset('token')
	session.unset('gistId')
	session.set('approvalStatus', 'pending')
}
