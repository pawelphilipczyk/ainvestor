/**
 * Environment resolution for the MCP server. Read once at startup so a missing
 * variable fails immediately with an actionable message rather than mid-call.
 */

export type McpConfig = {
	/** GitHub PAT with the `gist` scope. */
	githubToken: string
	/** Private data gist id, when pinned explicitly. Discovered by description when null. */
	dataGistId: string | null
	/** Whether the write tools are exposed at all. Off unless asked for. */
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

const ENABLED_FLAG_VALUES = ['1', 'true', 'yes', 'on']

/**
 * Whether the write tools are exposed. Read straight from the environment
 * rather than from {@link McpConfig} so the HTTP transport — which resolves no
 * process-wide config, since every request brings its own credentials — asks
 * the same question in the same words.
 *
 * Anything other than an explicit yes is a no: a typo must not switch writes on.
 */
export function writesAreEnabled(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	const value = (env.AINVESTOR_MCP_ALLOW_WRITES ?? '').trim().toLowerCase()
	return ENABLED_FLAG_VALUES.includes(value)
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
		allowWrites: writesAreEnabled(env),
	}
}

/** Config summary safe to return over the wire — never includes the token. */
export function describeMcpConfig(config: McpConfig) {
	return {
		githubTokenPresent: config.githubToken.length > 0,
		dataGistId: config.dataGistId,
		dataGistSource:
			config.dataGistId === null ? 'discovered' : 'AINVESTOR_GIST_ID',
		allowWrites: config.allowWrites,
	}
}
