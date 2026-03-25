import type { Session } from 'remix/session'

import { APPROVED_GITHUB_LOGINS } from './approved-github-logins.ts'

function parseEnvAllowlistToSet(raw: string): Set<string> | null {
	const set = new Set<string>()
	for (const part of raw.split(/[\s,]+/)) {
		if (part.length > 0) set.add(part.toLowerCase())
	}
	return set.size > 0 ? set : null
}

/** Normalize in-repo logins to a set, or null if the list is empty (no restriction). */
export function approvedGithubLoginSet(
	logins: readonly string[],
): Set<string> | null {
	const set = new Set<string>()
	for (const raw of logins) {
		const part = raw.trim()
		if (part.length > 0) set.add(part.toLowerCase())
	}
	return set.size > 0 ? set : null
}

function envGithubAllowlistSet(): Set<string> | null {
	const raw = (process.env.APPROVED_GITHUB_LOGINS ?? '').trim()
	if (!raw) return null
	return parseEnvAllowlistToSet(raw)
}

/**
 * Union of `APPROVED_GITHUB_LOGINS` in `approved-github-logins.ts` and optional
 * `APPROVED_GITHUB_LOGINS` env (comma/whitespace-separated). When both are empty,
 * there is no restriction. The env is useful for integration tests and optional
 * deploy-time additions without a code change.
 */
export function getApprovedGithubLoginsSet(): Set<string> | null {
	const fromFile = approvedGithubLoginSet(APPROVED_GITHUB_LOGINS)
	const fromEnv = envGithubAllowlistSet()
	if (!fromFile && !fromEnv) return null
	const merged = new Set<string>()
	if (fromFile) for (const login of fromFile) merged.add(login)
	if (fromEnv) for (const login of fromEnv) merged.add(login)
	return merged.size > 0 ? merged : null
}

export function isGithubLoginApprovalEnforced(): boolean {
	return getApprovedGithubLoginsSet() !== null
}

export function isGithubLoginApproved(login: string): boolean {
	const allowed = getApprovedGithubLoginsSet()
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
