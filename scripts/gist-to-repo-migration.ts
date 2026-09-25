/**
 * One-off copy of the owner's data gist into their private data repo — Phase 3
 * of `docs/STORAGE_MIGRATION_PLAN.md`. Run by hand, once per environment, from
 * `scripts/migrate-gist-to-repo.ts`.
 *
 * It never writes to or deletes the gist: until the Phase 4 cutover the gist
 * stays the source of truth, and afterwards it is the backup.
 */
import { parseArgs } from 'node:util'
import { findGistIdByDescription, getGistDescription } from '../app/lib/gist.ts'
import {
	findDataRepo,
	findOrCreateDataRepo,
	getDataRepoName,
	readFiles as readRepoFiles,
	writeFiles as writeRepoFiles,
} from '../app/lib/store/github-repo-store.ts'
import {
	GITHUB_API,
	GITHUB_REQUEST_TIMEOUT_MS,
	githubHeaders,
	readFiles as readGistFiles,
} from '../app/lib/store/github-store.ts'

export const MIGRATION_USAGE =
	'Usage: GH_TOKEN=… npm run migrate:gist-to-repo -- --env prod|preview [--apply] [--force]'

export type MigrationOptions = {
	environment: 'prod' | 'preview'
	/** Without it, nothing is created or written — the run only reports. */
	apply: boolean
	/** Replace repo files that already exist and differ from the gist. */
	force: boolean
}

/** Throws on an unknown flag or a missing/invalid `--env`. */
export function parseMigrationArguments(
	argumentList: string[],
): MigrationOptions {
	const { values } = parseArgs({
		args: argumentList,
		options: {
			env: { type: 'string' },
			apply: { type: 'boolean', default: false },
			force: { type: 'boolean', default: false },
		},
		strict: true,
		allowPositionals: false,
	})
	if (values.env !== 'prod' && values.env !== 'preview') {
		throw new Error('--env must be "prod" or "preview"')
	}
	return { environment: values.env, apply: values.apply, force: values.force }
}

export function migrationTargetNames(environment: 'prod' | 'preview') {
	const preview = environment === 'preview'
	return {
		gistDescription: getGistDescription({ preview }),
		repoName: getDataRepoName({ preview }),
	}
}

/**
 * Scopes this run needs that the token lacks. A classic token reports its
 * scopes in `X-OAuth-Scopes`; a fine-grained one sends no such header, so
 * `null` skips the check and lets GitHub's own `404`s speak instead.
 */
export function missingScopes(granted: readonly string[] | null): string[] {
	if (granted === null) return []
	return ['gist', 'repo'].filter((scope) => !granted.includes(scope))
}

export type PlannedFile = {
	path: string
	bytes: number
	action: 'create' | 'unchanged' | 'overwrite'
}

export function planFileCopies(params: {
	gistFiles: Record<string, string>
	repoFiles: Record<string, string | null>
}): PlannedFile[] {
	return Object.entries(params.gistFiles).map(([path, content]) => {
		const existing = params.repoFiles[path] ?? null
		const action =
			existing === null
				? 'create'
				: existing === content
					? 'unchanged'
					: 'overwrite'
		return { path, bytes: Buffer.byteLength(content, 'utf-8'), action }
	})
}

async function fetchAuthenticatedUser(
	token: string,
): Promise<{ login: string; scopes: string[] | null }> {
	const response = await fetch(`${GITHUB_API}/user`, {
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(token),
	})
	if (!response.ok) {
		throw new Error(
			`GitHub API error reading the token's user: ${response.status}`,
		)
	}
	const body = (await response.json()) as { login?: unknown }
	if (typeof body.login !== 'string' || body.login.length === 0) {
		throw new Error('GitHub did not report a login for this token')
	}
	const scopesHeader = response.headers.get('x-oauth-scopes')
	const scopes =
		scopesHeader === null
			? null
			: scopesHeader
					.split(',')
					.map((scope) => scope.trim())
					.filter((scope) => scope.length > 0)
	return { login: body.login, scopes }
}

/** Every file in the gist — listed, not assumed, so none is left behind. */
async function readAllGistFiles(params: {
	token: string
	gistId: string
}): Promise<Record<string, string>> {
	const listing = await fetch(`${GITHUB_API}/gists/${params.gistId}`, {
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
		headers: githubHeaders(params.token),
	})
	if (!listing.ok) {
		throw new Error(`GitHub API error reading the gist: ${listing.status}`)
	}
	const body = (await listing.json()) as { files?: Record<string, unknown> }
	const paths = Object.keys(body.files ?? {}).sort()
	if (paths.length === 0) throw new Error('The gist has no files to copy')

	// The gist backend's reader, not the listing above: it downloads files the
	// API truncated, which the listing alone would copy half of.
	const result = await readGistFiles({
		token: params.token,
		location: params.gistId,
		paths,
	})
	if (!result.ok) {
		throw new Error(`GitHub API error reading the gist: ${result.status}`)
	}
	const files: Record<string, string> = {}
	for (const path of paths) {
		const file = result.files[path]
		if (!file)
			throw new Error(`${path} is listed in the gist but has no content`)
		files[path] = file.content
	}
	return files
}

async function readRepoContents(params: {
	token: string
	location: string
	paths: string[]
}): Promise<Record<string, string | null>> {
	const result = await readRepoFiles(params)
	if (!result.ok) {
		throw new Error(
			`GitHub API error reading ${params.location}: ${result.status}`,
		)
	}
	return Object.fromEntries(
		params.paths.map((path) => [path, result.files[path]?.content ?? null]),
	)
}

/**
 * Plans the copy, prints it, and — with `apply` — performs it in one commit
 * and verifies every file against the gist. Resolves `false` when it refuses
 * or verification fails; throws on a GitHub error.
 */
export async function runMigration(
	params: MigrationOptions & { token: string; log: (line: string) => void },
): Promise<boolean> {
	const { token, environment, apply, force, log } = params
	const { gistDescription, repoName } = migrationTargetNames(environment)

	const user = await fetchAuthenticatedUser(token)
	const missing = missingScopes(user.scopes)
	if (missing.length > 0) {
		throw new Error(
			`The token lacks the ${missing.join(' and ')} scope — it needs both gist and repo`,
		)
	}

	const gistId = await findGistIdByDescription(token, gistDescription)
	if (gistId === null) {
		throw new Error(
			`No gist described "${gistDescription}" is visible to ${user.login}`,
		)
	}
	const gistFiles = await readAllGistFiles({ token, gistId })

	const existingLocation = await findDataRepo({
		token,
		login: user.login,
		repoName,
	})
	const repoFiles =
		existingLocation === null
			? {}
			: await readRepoContents({
					token,
					location: existingLocation,
					paths: Object.keys(gistFiles),
				})
	const plan = planFileCopies({ gistFiles, repoFiles })

	log(`Environment: ${environment}`)
	log(`Source:      gist ${gistId} ("${gistDescription}")`)
	log(
		`Target:      ${user.login}/${repoName}${existingLocation === null ? ' (does not exist yet)' : ''}`,
	)
	for (const file of plan) {
		log(`  ${file.action.padEnd(9)} ${file.path} (${file.bytes} bytes)`)
	}

	const overwrites = plan.filter((file) => file.action === 'overwrite')
	if (overwrites.length > 0 && !force) {
		log(
			`Refusing: ${overwrites.length} file(s) already in the repo differ from the gist. ` +
				'Rerun with --force to replace them with the gist copy.',
		)
		return false
	}

	const toWrite = plan.filter((file) => file.action !== 'unchanged')
	if (!apply) {
		log(
			toWrite.length === 0
				? 'Dry run: the repo already matches the gist.'
				: `Dry run: nothing was changed. Rerun with --apply to copy ${toWrite.length} file(s).`,
		)
		return true
	}

	const location =
		existingLocation ??
		(await findOrCreateDataRepo({ token, login: user.login, repoName }))
	if (existingLocation === null) log(`Created ${location}.`)

	if (toWrite.length > 0) {
		const result = await writeRepoFiles({
			token,
			location,
			files: Object.fromEntries(
				toWrite.map((file) => [file.path, gistFiles[file.path]]),
			),
		})
		if (!result.ok) {
			throw new Error(
				`GitHub API error writing to ${location}: ${result.status}`,
			)
		}
		log(`Wrote ${toWrite.length} file(s) to ${location} in one commit.`)
	}

	const copied = await readRepoContents({
		token,
		location,
		paths: Object.keys(gistFiles),
	})
	const mismatched = Object.keys(gistFiles).filter(
		(path) => copied[path] !== gistFiles[path],
	)
	if (mismatched.length > 0) {
		log(
			`Verification FAILED — these files in ${location} do not match the gist: ${mismatched.join(', ')}`,
		)
		log(
			'GitHub can briefly serve a file from before a fresh commit: rerun without --apply to re-check. ' +
				'If they still differ, it lists them as "overwrite".',
		)
		return false
	}
	log(
		`Verified: all ${plan.length} file(s) in ${location} match the gist exactly.`,
	)
	return true
}
