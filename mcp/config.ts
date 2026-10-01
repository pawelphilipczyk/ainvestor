/**
 * Environment resolution for the MCP server. Read once at startup so a missing
 * variable fails immediately with an actionable message rather than mid-call.
 */
import { getSharedCatalogRepo } from '../app/features/catalog/lib.ts'

export type McpConfig = {
	/** GitHub PAT with the `gist` and `repo` scopes. */
	githubToken: string
	/** Private data repo (`owner/repo`), when pinned explicitly. The token owner's own when null. */
	dataRepo: string | null
	/**
	 * The shared catalog's repo, `owner/repo`: `SHARED_CATALOG_REPO` when set,
	 * otherwise the app's own. Read with the same token, so the token's account
	 * must be able to see it (the `ainvestor-users` team).
	 */
	sharedCatalogRepo: string
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
			hint: 'Create a GitHub personal access token with the `gist` and `repo` scopes.',
		}),
		dataRepo: readOptional(env, 'AINVESTOR_DATA_REPO'),
		sharedCatalogRepo: getSharedCatalogRepo(env),
	}
}

/** Config summary safe to return over the wire — never includes the token. */
export function describeMcpConfig(config: McpConfig) {
	return {
		githubTokenPresent: config.githubToken.length > 0,
		dataRepo: config.dataRepo,
		dataRepoSource:
			config.dataRepo === null ? 'token owner' : 'AINVESTOR_DATA_REPO',
		sharedCatalogRepo: config.sharedCatalogRepo,
	}
}
