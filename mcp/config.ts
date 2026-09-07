/**
 * Environment resolution for the MCP server. Read once at startup so a missing
 * variable fails immediately with an actionable message rather than mid-call.
 */

export type McpConfig = {
	/** GitHub PAT with the `gist` scope. */
	githubToken: string
	/** Private data gist id, when pinned explicitly. Discovered by description when null. */
	dataGistId: string | null
	/** Public gist holding `catalog.json`. */
	sharedCatalogGistId: string
}

function readRequired(params: {
	env: NodeJS.ProcessEnv
	name: string
	hint: string
}): string {
	const { env, name, hint } = params
	const value = (env[name] ?? '').trim()
	if (value.length === 0) {
		throw new Error(`[mcp] ${name} is not set. ${hint}`)
	}
	return value
}

function readOptional(env: NodeJS.ProcessEnv, name: string): string | null {
	const value = (env[name] ?? '').trim()
	return value.length > 0 ? value : null
}

export function resolveMcpConfig(
	env: NodeJS.ProcessEnv = process.env,
): McpConfig {
	return {
		githubToken: readRequired({
			env,
			name: 'GH_TOKEN',
			hint: 'Create a GitHub personal access token with the `gist` scope.',
		}),
		dataGistId: readOptional(env, 'AINVESTOR_GIST_ID'),
		// Required rather than optional: without it fetchCatalog() quietly returns
		// an empty list, so the catalog tools would answer "no such fund" instead
		// of "no catalog configured".
		sharedCatalogGistId: readRequired({
			env,
			name: 'SHARED_CATALOG_GIST_ID',
			hint: 'Set it to the public gist holding catalog.json (the same value the web app uses).',
		}),
	}
}

/** Config summary safe to return over the wire — never includes the token. */
export function describeMcpConfig(config: McpConfig) {
	return {
		githubTokenPresent: config.githubToken.length > 0,
		dataGistId: config.dataGistId,
		dataGistSource:
			config.dataGistId === null ? 'discovered' : 'AINVESTOR_GIST_ID',
		sharedCatalogGistId: config.sharedCatalogGistId,
	}
}
