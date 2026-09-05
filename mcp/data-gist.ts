import { findGistIdByDescription, getGistDescription } from '../app/lib/gist.ts'

/**
 * What a tool needs to reach one user's data gist.
 *
 * Deliberately narrower than {@link McpConfig}: over stdio these come from the
 * process environment, but over HTTP every request carries its own, so the tool
 * layer must not depend on process-wide configuration.
 */
export type GistCredentials = {
	/** GitHub token with the `gist` scope. */
	githubToken: string
	/** Pinned data gist id, or null to discover it by description. */
	dataGistId: string | null
}

/** Bounds the per-token caches; the HTTP endpoint is multi-user. */
const MAX_CACHED_TOKENS = 50

const gistIdByToken = new Map<string, string>()
const lookupByToken = new Map<string, Promise<string>>()

/** Test seam: forget every resolved gist id between cases. */
export function resetDataGistIdCache(): void {
	gistIdByToken.clear()
	lookupByToken.clear()
}

function rememberGistId(token: string, gistId: string): void {
	if (gistIdByToken.size >= MAX_CACHED_TOKENS) {
		const oldest = gistIdByToken.keys().next()
		if (!oldest.done) gistIdByToken.delete(oldest.value)
	}
	gistIdByToken.set(token, gistId)
}

async function discoverDataGistId(
	credentials: GistCredentials,
): Promise<string> {
	const description = getGistDescription()
	const found = await findGistIdByDescription(
		credentials.githubToken,
		description,
	)
	if (found === null) {
		throw new Error(
			`[mcp] No gist described "${description}" is visible to this token. ` +
				'Sign in to the web app once to create it, or pin an existing gist id.',
		)
	}
	return found
}

/**
 * Resolve the data gist for one set of credentials: the pinned id when set,
 * otherwise discovery by description.
 *
 * Unlike the web app's `findOrCreateGist`, this never creates a gist — a read
 * tool silently creating storage would be surprising, and an empty new gist
 * would look like a wiped portfolio.
 *
 * Caches are **keyed by token**: the HTTP endpoint serves whoever presents a
 * token, so a process-wide cache would hand one user another user's gist id.
 * Concurrent callers with the same token share one lookup, which can cost up to
 * 50 authenticated requests. Failures are not cached, so creating the gist and
 * retrying works without a restart.
 */
export async function resolveDataGistId(
	credentials: GistCredentials,
): Promise<string> {
	if (credentials.dataGistId !== null) return credentials.dataGistId

	const token = credentials.githubToken
	const cached = gistIdByToken.get(token)
	if (cached !== undefined) return cached

	const running = lookupByToken.get(token)
	if (running !== undefined) return running

	const lookup = discoverDataGistId(credentials).then(
		(gistId) => {
			rememberGistId(token, gistId)
			lookupByToken.delete(token)
			return gistId
		},
		(error: unknown) => {
			lookupByToken.delete(token)
			throw error
		},
	)
	lookupByToken.set(token, lookup)
	return lookup
}
