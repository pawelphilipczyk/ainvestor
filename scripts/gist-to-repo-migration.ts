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
	REPO_MARKER_PATH,
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
	/** Replace or delete repo files that differ from, or are no longer in, the gist. */
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
	/** `delete`: in the repo but no longer in the gist — cleared advice, say. */
	action: 'create' | 'unchanged' | 'overwrite' | 'delete'
}

function byteLength(content: string): number {
	return Buffer.byteLength(content, 'utf-8')
}

/**
 * Compares the gist with every data file in the repo — not just the files the
 * gist names, so one the gist has since dropped is planned as a `delete`
 * instead of surviving the copy unnoticed.
 */
export function planFileCopies(params: {
	gistFiles: Record<string, string>
	repoFiles: Record<string, string>
}): PlannedFile[] {
	const { gistFiles, repoFiles } = params
	const fromGist = Object.entries(gistFiles).map(
		([path, content]): PlannedFile => {
			const existing = Object.hasOwn(repoFiles, path)
				? repoFiles[path]
				: undefined
			const action =
				existing === undefined
					? 'create'
					: existing === content
						? 'unchanged'
						: 'overwrite'
			return { path, bytes: byteLength(content), action }
		},
	)
	const dropped = Object.entries(repoFiles)
		.filter(([path]) => !Object.hasOwn(gistFiles, path))
		.map(
			([path, content]): PlannedFile => ({
				path,
				bytes: byteLength(content),
				action: 'delete',
			}),
		)
	return [...fromGist, ...dropped]
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

/** Repo files the app puts there itself, which never come from the gist. */
const REPO_FILES_NOT_FROM_GIST = new Set([REPO_MARKER_PATH, 'README.md'])

/**
 * Every data file at the repo's root: all of them except the ownership marker
 * and the README GitHub creates with the repo.
 */
async function readRepoDataFiles(params: {
	token: string
	location: string
}): Promise<Record<string, string>> {
	const listing = await fetch(
		`${GITHUB_API}/repos/${params.location}/contents/`,
		{
			signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
			headers: githubHeaders(params.token),
		},
	)
	if (!listing.ok) {
		throw new Error(
			`GitHub API error listing ${params.location}: ${listing.status}`,
		)
	}
	const entries = (await listing.json()) as Array<{
		type?: string
		path?: string
	}>
	const paths = entries
		.filter((entry) => entry.type === 'file')
		.map((entry) => entry.path)
		.filter(
			(path): path is string =>
				typeof path === 'string' && !REPO_FILES_NOT_FROM_GIST.has(path),
		)
	if (paths.length === 0) return {}

	const result = await readRepoFiles({ ...params, paths })
	if (!result.ok) {
		throw new Error(
			`GitHub API error reading ${params.location}: ${result.status}`,
		)
	}
	const files: Record<string, string> = {}
	for (const path of paths) {
		const file = result.files[path]
		if (file) files[path] = file.content
	}
	return files
}

function changedFiles(plan: PlannedFile[]): PlannedFile[] {
	return plan.filter((file) => file.action !== 'unchanged')
}

/**
 * Plans the copy, prints it, and — with `apply` — performs it in one commit,
 * then verifies the repo's data files against the gist. Resolves `false` when
 * it refuses or verification fails; throws on a GitHub error.
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
			: await readRepoDataFiles({ token, location: existingLocation })
	const plan = planFileCopies({ gistFiles, repoFiles })

	log(`Environment: ${environment}`)
	log(`Source:      gist ${gistId} ("${gistDescription}")`)
	log(
		`Target:      ${user.login}/${repoName}${existingLocation === null ? ' (does not exist yet)' : ''}`,
	)
	for (const file of plan) {
		log(`  ${file.action.padEnd(9)} ${file.path} (${file.bytes} bytes)`)
	}

	const destructive = plan.filter(
		(file) => file.action === 'overwrite' || file.action === 'delete',
	)
	if (destructive.length > 0 && !force) {
		log(
			`Refusing: ${destructive.length} file(s) already in the repo would be replaced or deleted. ` +
				'Rerun with --force to make the repo match the gist.',
		)
		return false
	}

	const toWrite = changedFiles(plan)
	if (!apply) {
		log(
			toWrite.length === 0
				? 'Dry run: the repo already matches the gist.'
				: `Dry run: nothing was changed. Rerun with --apply to write ${toWrite.length} change(s).`,
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
				toWrite.map((file) => [
					file.path,
					file.action === 'delete' ? null : gistFiles[file.path],
				]),
			),
		})
		if (!result.ok) {
			throw new Error(
				`GitHub API error writing to ${location}: ${result.status}`,
			)
		}
		log(`Wrote ${toWrite.length} change(s) to ${location} in one commit.`)
	}

	const mismatched = changedFiles(
		planFileCopies({
			gistFiles,
			repoFiles: await readRepoDataFiles({ token, location }),
		}),
	)
	if (mismatched.length > 0) {
		log(
			`Verification FAILED — ${location} does not match the gist: ` +
				mismatched.map((file) => `${file.path} (${file.action})`).join(', '),
		)
		log(
			'GitHub can briefly serve files from before a fresh commit: rerun without --apply to re-check.',
		)
		return false
	}

	// The gist is still the live store, so an edit made during this run would
	// leave the repo holding the earlier version while claiming a match.
	const gistChanges = changedFiles(
		planFileCopies({
			gistFiles: await readAllGistFiles({ token, gistId }),
			repoFiles: gistFiles,
		}),
	)
	if (gistChanges.length > 0) {
		log(
			`The gist changed during this run (${gistChanges.map((file) => file.path).join(', ')}), ` +
				'so the repo holds the earlier version. Stop editing, then rerun with --apply --force.',
		)
		return false
	}

	log(
		`Verified: the ${Object.keys(gistFiles).length} data file(s) in ${location} match the gist exactly.`,
	)
	return true
}
