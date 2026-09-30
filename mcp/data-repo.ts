import {
	fetchAuthenticatedUser,
	findDataRepo,
	getDataRepoName,
	parseRepoLocation,
} from '../app/lib/store/github-repo-store.ts'
import { createTokenCache } from './token-cache.ts'

/**
 * What a tool needs to reach one user's data repo.
 *
 * Deliberately narrower than {@link McpConfig}: over stdio these come from the
 * process environment, but over HTTP every request carries its own, so the tool
 * layer must not depend on process-wide configuration.
 */
export type DataRepoCredentials = {
	/** GitHub token with the `repo` scope (and `gist`, for the shared catalog). */
	githubToken: string
	/** Pinned data repo, `"owner/repo"`, or null to use the token owner's own. */
	dataRepo: string | null
}

/** Bounds the per-token caches; the HTTP endpoint is multi-user. */
const MAX_CACHED_TOKENS = 50

const repoByKey = createTokenCache<string>(MAX_CACHED_TOKENS)
const lookupByKey = createTokenCache<Promise<string>>(MAX_CACHED_TOKENS)

/** Test seam: forget every resolved repo between cases. */
export function resetDataRepoCache(): void {
	repoByKey.clear()
	lookupByKey.clear()
}

/** A pin changes the answer for the same token, so it is part of the key. */
function cacheKey(credentials: DataRepoCredentials): string {
	return `${credentials.dataRepo ?? ''} ${credentials.githubToken}`
}

async function lookUpDataRepo(
	credentials: DataRepoCredentials,
): Promise<string> {
	const user = await fetchAuthenticatedUser(credentials.githubToken)
	// Without `repo`, GitHub answers every read of a private repo with a 404 —
	// indistinguishable from "no data yet", so the model would see an empty
	// portfolio. The 403 in this message makes the HTTP transport answer 401
	// with the scope challenge, which sends the client back through sign-in.
	if (user.scopes !== null && !user.scopes.includes('repo')) {
		throw new Error(
			'GitHub API error 403: this token was not granted the repo scope, which the data repo needs. ' +
				'Reconnect to grant repository access (over stdio: give GH_TOKEN the repo scope).',
		)
	}
	if (credentials.dataRepo !== null) {
		if (parseRepoLocation(credentials.dataRepo) === null) {
			throw new Error(
				`[mcp] The pinned data repo must be "owner/repo", not "${credentials.dataRepo}"`,
			)
		}
		return credentials.dataRepo
	}
	const location = await findDataRepo({
		token: credentials.githubToken,
		login: user.login,
	})
	if (location === null) {
		throw new Error(
			`[mcp] ${user.login}/${getDataRepoName()} does not exist yet. ` +
				'Sign in to the web app once to create it, or pin an existing repo.',
		)
	}
	return location
}

/**
 * Resolve the data repo for one set of credentials: the pinned repo when set,
 * otherwise the token owner's `<login>/ainvestor-data` (or its preview name).
 * Either way the token's scopes are checked first.
 *
 * Unlike the web app's sign-in, this never creates the repo — a read tool
 * silently creating storage would be surprising, and an empty new repo would
 * look like a wiped portfolio.
 *
 * Caches are **keyed by token** (see Stage 10 in docs/MCP_SERVER_PLAN.md), with
 * the pin folded in. Concurrent callers with the same key share one lookup.
 * Failures are not cached, so creating the repo or reconnecting with the right
 * scope works without a restart.
 */
export async function resolveDataRepo(
	credentials: DataRepoCredentials,
): Promise<string> {
	const key = cacheKey(credentials)
	const cached = repoByKey.get(key)
	if (cached !== undefined) return cached

	const running = lookupByKey.get(key)
	if (running !== undefined) return running

	const lookup = lookUpDataRepo(credentials).then(
		(location) => {
			repoByKey.set(key, location)
			lookupByKey.delete(key)
			return location
		},
		(error: unknown) => {
			lookupByKey.delete(key)
			throw error
		},
	)
	lookupByKey.set(key, lookup)
	return lookup
}
