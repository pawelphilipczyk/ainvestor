import type { Session } from 'remix/session'

import { APPROVED_GITHUB_LOGINS } from './approved-github-logins.ts'

/** Lowercase trimmed non-empty strings from an iterable of raw tokens. */
function normalizedLoginSet(parts: Iterable<string>): Set<string> {
	const set = new Set<string>()
	for (const raw of parts) {
		const part = raw.trim()
		if (part.length > 0) set.add(part.toLowerCase())
	}
	return set
}

function envGithubAllowlistSet(): Set<string> {
	const raw = (process.env.APPROVED_GITHUB_LOGINS ?? '').trim()
	if (!raw) return new Set()
	return normalizedLoginSet(raw.split(/[\s,]+/))
}

/** Normalize logins to a lowercase set (empty array → empty set). */
export function approvedGithubLoginSet(logins: readonly string[]): Set<string> {
	return normalizedLoginSet(logins)
}

/**
 * Union of `APPROVED_GITHUB_LOGINS` in `approved-github-logins.ts` and optional
 * `APPROVED_GITHUB_LOGINS` env (comma/whitespace-separated). An empty union means
 * no one is approved until at least one login is added (file and/or env).
 */
export function getApprovedGithubLoginsSet(): Set<string> {
	const merged = new Set<string>()
	for (const login of approvedGithubLoginSet(APPROVED_GITHUB_LOGINS)) {
		merged.add(login)
	}
	for (const login of envGithubAllowlistSet()) {
		merged.add(login)
	}
	return merged
}

export function isGithubLoginApproved(login: string): boolean {
	return getApprovedGithubLoginsSet().has(login.trim().toLowerCase())
}

/**
 * If the session user is not on the allowlist, drop GitHub credentials so we
 * never use a token for an unapproved account (including when the list is empty).
 */
export function stripGithubTokenIfUnapproved(session: Session): void {
	const login = session.get('login') as string | undefined
	const token = session.get('token') as string | undefined
	if (!login || !token) return
	if (isGithubLoginApproved(login)) return
	session.unset('token')
	session.unset('gistId')
	session.set('approvalStatus', 'pending')
}
