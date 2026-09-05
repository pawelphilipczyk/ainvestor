/**
 * Environment resolution for the MCP server. Read once at startup so a missing
 * variable fails immediately with an actionable message rather than mid-call.
 */

export type McpConfig = {
	/** GitHub PAT with the `gist` scope. */
	githubToken: string
	/**
	 * Public gist holding `catalog.json`; same value the web app uses. Optional
	 * until a catalog tool exists — refusing to start over a variable nothing
	 * reads would be a dead server for no reason.
	 */
	sharedCatalogGistId: string | null
	/** Private data gist id, when pinned explicitly. Discovered by description when null. */
	dataGistId: string | null
	/** Write tools stay unregistered unless this is explicitly enabled. */
	allowWrites: boolean
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

/** Truthy only for an explicit opt-in; anything else keeps the server read-only. */
function readBooleanFlag(env: NodeJS.ProcessEnv, name: string): boolean {
	const value = (env[name] ?? '').trim().toLowerCase()
	return value === '1' || value === 'true'
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
		sharedCatalogGistId: readOptional(env, 'SHARED_CATALOG_GIST_ID'),
		dataGistId: readOptional(env, 'AINVESTOR_GIST_ID'),
		allowWrites: readBooleanFlag(env, 'AINVESTOR_MCP_ALLOW_WRITES'),
	}
}

/** Config summary safe to return over the wire — never includes the token. */
export function describeMcpConfig(config: McpConfig) {
	return {
		githubTokenPresent: config.githubToken.length > 0,
		sharedCatalogGistId: config.sharedCatalogGistId,
		toolsAvailable: ['get_portfolio'],
		dataGistId: config.dataGistId,
		dataGistSource:
			config.dataGistId === null ? 'discovered' : 'AINVESTOR_GIST_ID',
		allowWrites: config.allowWrites,
	}
}
