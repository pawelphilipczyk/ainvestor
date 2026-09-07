import { isGithubLoginApproved } from '../app/lib/approved-users.ts'
import { createTokenCache } from './token-cache.ts'

/**
 * Whether a caller may be served the deployment's **own** pinned gist. See
 * decision D3 and the Stage 10 security note in docs/MCP_SERVER_PLAN.md.
 */

const GITHUB_API = 'https://api.github.com'

/** Bounds the cache; the endpoint is reachable by anyone with a GitHub token. */
const MAX_CACHED_CALLERS = 50

const loginByToken = createTokenCache<string>(MAX_CACHED_CALLERS)

/** Test seam: forget every resolved caller between cases. */
export function resetApprovedCallerCache(): void {
	loginByToken.clear()
}

/**
 * The GitHub login a token belongs to, or null when GitHub will not say.
 *
 * Cached per token, because more than one decision hangs off the caller's
 * identity — the allowlist below, and whether they own the shared catalog gist.
 * A failed lookup is not cached, so a transient GitHub error does not lock the
 * caller out for the process lifetime.
 */
export async function resolveCallerLogin(
	token: string,
): Promise<string | null> {
	const cached = loginByToken.get(token)
	if (cached !== undefined) return cached

	const response = await fetch(`${GITHUB_API}/user`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		},
	})
	if (!response.ok) return null

	const user = (await response.json()) as { login?: unknown }
	if (typeof user.login !== 'string') return null

	loginByToken.set(token, user.login)
	return user.login
}

/**
 * Resolves the token's GitHub login and checks it against the allowlist.
 * An unresolvable login is treated as not approved.
 */
export async function callerIsApproved(token: string): Promise<boolean> {
	const login = await resolveCallerLogin(token)
	if (login === null) return false
	return isGithubLoginApproved(login)
}
