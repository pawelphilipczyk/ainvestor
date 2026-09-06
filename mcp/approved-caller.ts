import { isGithubLoginApproved } from '../app/lib/approved-users.ts'
import { createTokenCache } from './token-cache.ts'

/**
 * Whether a caller may be served the deployment's **own** pinned gist.
 *
 * `AINVESTOR_GIST_ID` names one specific gist, so honouring it for anyone with
 * any GitHub token would hand a stranger the deployment owner's holdings —
 * secret gists are unlisted, not access-controlled, so possessing the id is
 * enough to read one. Pinning a gist therefore means "this deployment serves
 * that gist's owner", and the caller must prove they are that person.
 *
 * This also restores the invariant `stripGithubTokenIfUnapproved` enforces on
 * every session-backed route: the app never acts on a token belonging to an
 * account that is not on the allowlist.
 */

const GITHUB_API = 'https://api.github.com'

/** Bounds the cache; the endpoint is reachable by anyone with a GitHub token. */
const MAX_CACHED_CALLERS = 50

const approvalByToken = createTokenCache<boolean>(MAX_CACHED_CALLERS)

/** Test seam: forget every resolved caller between cases. */
export function resetApprovedCallerCache(): void {
	approvalByToken.clear()
}

/**
 * Resolves the token's GitHub login and checks it against the allowlist.
 * A failed lookup is treated as not approved and is not cached, so a transient
 * GitHub error does not lock the caller out for the process lifetime.
 */
export async function callerIsApproved(token: string): Promise<boolean> {
	const cached = approvalByToken.get(token)
	if (cached !== undefined) return cached

	const response = await fetch(`${GITHUB_API}/user`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		},
	})
	if (!response.ok) return false

	const user = (await response.json()) as { login?: unknown }
	if (typeof user.login !== 'string') return false

	const approved = isGithubLoginApproved(user.login)
	approvalByToken.set(token, approved)
	return approved
}
