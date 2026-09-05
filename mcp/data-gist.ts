import { findGistIdByDescription, getGistDescription } from '../app/lib/gist.ts'
import type { McpConfig } from './config.ts'

let cachedDataGistId: string | null = null

/** Test seam: forget the resolved gist id between cases. */
export function resetDataGistIdCache(): void {
	cachedDataGistId = null
}

/**
 * Resolve the private data gist once per process: the pinned id when set,
 * otherwise discovery by description.
 *
 * Unlike the web app's `findOrCreateGist`, this never creates a gist — a read
 * tool silently creating storage would be surprising, and an empty new gist
 * would look like a wiped portfolio.
 */
export async function resolveDataGistId(config: McpConfig): Promise<string> {
	if (config.dataGistId !== null) return config.dataGistId
	if (cachedDataGistId !== null) return cachedDataGistId

	const description = getGistDescription()
	const found = await findGistIdByDescription(config.githubToken, description)
	if (found === null) {
		throw new Error(
			`[mcp] No gist described "${description}" is visible to this token. ` +
				'Sign in to the web app once to create it, or set AINVESTOR_GIST_ID to an existing gist.',
		)
	}
	cachedDataGistId = found
	return found
}
