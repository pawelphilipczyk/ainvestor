import { createRedirectResponse } from 'remix/response/redirect'
import type { Middleware } from 'remix/router'
import { Session } from 'remix/session'
import { routes } from '../routes.ts'
import { getSessionIdentity } from './session.ts'

/**
 * The app's own pages, all of which need a GitHub sign-in.
 *
 * Listed rather than derived as "everything that is not public": a catch-all
 * would answer an unknown URL with a redirect instead of a `404`, hiding
 * genuine misses. `require-approved-session.test.ts` pins both halves — every
 * prefix here redirects, and the routes left out of it do not.
 */
const PROTECTED_PATH_PREFIXES: readonly string[] = [
	routes.portfolio.index.href(),
	routes.guidelines.index.href(),
	routes.catalog.index.href(),
	routes.advice.index.href(),
	'/admin',
	'/fragments',
]

function isUnder(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function requiresSignIn(pathname: string): boolean {
	return PROTECTED_PATH_PREFIXES.some((prefix) => isUnder(pathname, prefix))
}

/**
 * Requires a GitHub sign-in for every page in {@link PROTECTED_PATH_PREFIXES}.
 *
 * Signing in is the gate, not approval: a session that is signed in but
 * **pending** allowlist approval passes through, because each feature renders
 * its own pending-approval state (`advice.pending.*`,
 * `guidelines.subtitle.pending`, and so on). Only a session with no `login` at
 * all is turned away.
 *
 * Signed-out visitors go to the intro page rather than to `routes.auth.login`:
 * the OAuth flow has no return-to, so it would land them on the intro page
 * anyway, one off-site round trip later.
 *
 * Must run after `session()` (there is nothing to read before it) and after
 * `enforceGithubApproval()` (which strips tokens from unapproved logins, so
 * the pending state is settled by the time this runs). Asset requests never
 * reach it: `remixAssets()` answers those first.
 *
 * Typed against the bare `Middleware` contract for the same reason as
 * `enforceGithubApproval` — see the note on that function in `app/router.ts`.
 */
export function requireApprovedSession(): Middleware {
	return async (context, next) => {
		const pathname = new URL(context.request.url).pathname
		if (!requiresSignIn(pathname)) return next()

		const session = context.get(Session)
		const identity = session ? getSessionIdentity(session) : null
		if (identity) return next()

		return createRedirectResponse(routes.home.index.href())
	}
}
