/**
 * One-off copies of a gist into a repo, run by hand from
 * `scripts/migrate-gist-to-repo.ts` (see `docs/STORAGE_MIGRATION_PLAN.md`):
 *
 * - **data** (Phase 3): the owner's data gist into their private data repo,
 *   once per environment.
 * - **catalog** (Phase 6): a shared catalog gist into the organization's
 *   catalog repo, which preview and prod share.
 *
 * It never writes to or deletes the gist: until the cutover the gist stays the
 * source of truth, and afterwards it is the backup.
 */
import { parseArgs } from 'node:util'
import {
	CATALOG_FILENAME,
	getSharedCatalogRepo,
} from '../app/features/catalog/lib.ts'
import { findGistIdByDescription, getGistDescription } from '../app/lib/gist.ts'
import {
	fetchAuthenticatedUser,
	findDataRepo,
	findOrCreateDataRepo,
	getDataRepoName,
	getRepoAccess,
	parseRepoLocation,
	REPO_MARKER_PATH,
	readFiles as readRepoFiles,
	writeFile as writeRepoFile,
	writeFiles as writeRepoFiles,
} from '../app/lib/store/github-repo-store.ts'
import {
	GITHUB_API,
	GITHUB_REQUEST_TIMEOUT_MS,
	githubHeaders,
	readFiles as readGistFiles,
} from '../app/lib/store/github-store.ts'

export const MIGRATION_USAGE = [
	'Usage: GH_TOKEN=… npm run migrate:gist-to-repo -- --env prod|preview [--apply] [--force]',
	'       GH_TOKEN=… npm run migrate:gist-to-repo -- --catalog --gist <catalog gist id> [--apply] [--force]',
].join('\n')

export type MigrationOptions = {
	environment: 'prod' | 'preview'
	/** Without it, nothing is created or written — the run only reports. */
	apply: boolean
	/** Replace or delete repo files that differ from, or are no longer in, the gist. */
	force: boolean
}

export type CatalogMigrationOptions = {
	/** The catalog gist to copy. Its id is a deployment secret, so it is named rather than found. */
	gistId: string
	apply: boolean
	force: boolean
}

export type ParsedMigrationArguments =
	| ({ kind: 'data' } & MigrationOptions)
	| ({ kind: 'catalog' } & CatalogMigrationOptions)

/** Throws on an unknown flag, a missing/invalid `--env`, or `--catalog` without `--gist`. */
export function parseMigrationArguments(
	argumentList: string[],
): ParsedMigrationArguments {
	const { values } = parseArgs({
		args: argumentList,
		options: {
			env: { type: 'string' },
			catalog: { type: 'boolean', default: false },
			gist: { type: 'string' },
			apply: { type: 'boolean', default: false },
			force: { type: 'boolean', default: false },
		},
		strict: true,
		allowPositionals: false,
	})
	if (values.catalog) {
		if (values.env !== undefined) {
			throw new Error(
				'--catalog takes no --env: preview and prod share one catalog repo',
			)
		}
		const gistId = (values.gist ?? '').trim()
		if (!/^[A-Za-z0-9]+$/.test(gistId)) {
			throw new Error('--catalog needs --gist <the catalog gist id>')
		}
		return { kind: 'catalog', gistId, apply: values.apply, force: values.force }
	}
	if (values.gist !== undefined) {
		throw new Error('--gist only goes with --catalog')
	}
	if (values.env !== 'prod' && values.env !== 'preview') {
		throw new Error('--env must be "prod" or "preview"')
	}
	return {
		kind: 'data',
		environment: values.env,
		apply: values.apply,
		force: values.force,
	}
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
 * and the README GitHub creates with the repo. `null` for a repo that exists
 * but has no commits yet, whose root listing GitHub answers with 404.
 */
async function readRepoDataFiles(params: {
	token: string
	location: string
}): Promise<Record<string, string> | null> {
	const listing = await fetch(
		`${GITHUB_API}/repos/${params.location}/contents/`,
		{
			signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
			headers: githubHeaders(params.token),
		},
	)
	if (listing.status === 404) return null
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
 * The part both copies share: plan the copy, print it, refuse a destructive
 * plan without `force`, and — with `apply` — make sure the repo is ready, write
 * every change in one commit, then verify the repo's data files against the
 * gist and that the gist did not change meanwhile. Resolves `false` when it
 * refuses or verification fails; throws on a GitHub error.
 */
async function copyGistIntoRepo(params: {
	token: string
	gistId: string
	location: string
	/** Lines printed before the plan: what is copied where. */
	header: string[]
	/** The repo's data files now; `{}` when it does not exist or has no commits. */
	repoFiles: Record<string, string>
	/** Creates or initialises the repo. Called only with `apply`, before the write. */
	prepareRepo: () => Promise<void>
	/** Checks the gist is the kind this run expects, before anything is planned. */
	checkGist?: (files: Record<string, string>) => void
	apply: boolean
	force: boolean
	log: (line: string) => void
}): Promise<boolean> {
	const { token, gistId, location, apply, force, log } = params
	const gistFiles = await readAllGistFiles({ token, gistId })
	params.checkGist?.(gistFiles)
	const plan = planFileCopies({ gistFiles, repoFiles: params.repoFiles })

	for (const line of params.header) log(line)
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

	await params.prepareRepo()

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
			repoFiles: (await readRepoDataFiles({ token, location })) ?? {},
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

async function requireScopes(token: string) {
	const user = await fetchAuthenticatedUser(token)
	const missing = missingScopes(user.scopes)
	if (missing.length > 0) {
		throw new Error(
			`The token lacks the ${missing.join(' and ')} scope — it needs both gist and repo`,
		)
	}
	return user
}

/** Copies the owner's data gist for one environment into their data repo. */
export async function runMigration(
	params: MigrationOptions & { token: string; log: (line: string) => void },
): Promise<boolean> {
	const { token, environment } = params
	const { gistDescription, repoName } = migrationTargetNames(environment)
	const user = await requireScopes(token)

	const gistId = await findGistIdByDescription(token, gistDescription)
	if (gistId === null) {
		throw new Error(
			`No gist described "${gistDescription}" is visible to ${user.login}`,
		)
	}

	const existingLocation = await findDataRepo({
		token,
		login: user.login,
		repoName,
	})
	const location = existingLocation ?? `${user.login}/${repoName}`
	return copyGistIntoRepo({
		...params,
		gistId,
		location,
		header: [
			`Environment: ${environment}`,
			`Source:      gist ${gistId} ("${gistDescription}")`,
			`Target:      ${location}${existingLocation === null ? ' (does not exist yet)' : ''}`,
		],
		repoFiles:
			existingLocation === null
				? {}
				: ((await readRepoDataFiles({ token, location })) ?? {}),
		prepareRepo: async () => {
			if (existingLocation !== null) return
			await findOrCreateDataRepo({ token, login: user.login, repoName })
			params.log(`Created ${location}.`)
		},
	})
}

/**
 * What an organization's OAuth-app restriction looks like from here: GitHub
 * hides a private repo (404) or refuses the request (403) for an app the
 * organization has not approved, which is easy to mistake for a missing repo.
 */
function organizationAccessHint(organization: string): string {
	return (
		`If ${organization} restricts OAuth app access, approve GitHub CLI (and both AInvestor OAuth apps) ` +
		"under the organization's Settings → Third-party access, then rerun."
	)
}

/**
 * Copies a catalog gist into the shared catalog repo, creating the repo in its
 * organization when it does not exist. The token's account must be able to
 * push there — the same access that makes someone a catalog admin in the app.
 */
export async function runCatalogMigration(
	params: CatalogMigrationOptions & {
		token: string
		log: (line: string) => void
	},
): Promise<boolean> {
	const { token, gistId } = params
	const location = getSharedCatalogRepo()
	const parsed = parseRepoLocation(location)
	if (parsed === null) {
		throw new Error(`The catalog repo must be "owner/repo", not "${location}"`)
	}
	const user = await requireScopes(token)

	const access = await getRepoAccess({ token, location })
	if (access.found && !access.canWrite) {
		throw new Error(
			`${user.login} can read ${location} but not push to it, so it cannot copy the catalog there.`,
		)
	}
	const repoFiles = access.found
		? await readRepoDataFiles({ token, location })
		: null

	return copyGistIntoRepo({
		...params,
		location,
		header: [
			`Source:      catalog gist ${gistId}`,
			`Target:      ${location}${
				!access.found
					? ' (does not exist yet, or is hidden from this token)'
					: repoFiles === null
						? ' (exists, no commits yet)'
						: ''
			}`,
		],
		repoFiles: repoFiles ?? {},
		checkGist: (files) => {
			if (!Object.hasOwn(files, CATALOG_FILENAME)) {
				throw new Error(
					`Gist ${gistId} has no ${CATALOG_FILENAME}, so it is not a catalog gist — check the id.`,
				)
			}
		},
		prepareRepo: async () => {
			if (!access.found) {
				const response = await fetch(
					`${GITHUB_API}/orgs/${parsed.owner}/repos`,
					{
						method: 'POST',
						signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
						headers: githubHeaders(token),
						body: JSON.stringify({
							name: parsed.repo,
							private: true,
							auto_init: true, // a repo with no commits has no branch to commit onto
							description: 'Shared ETF catalog for the AI Investor app.',
						}),
					},
				)
				if (!response.ok) {
					throw new Error(
						`GitHub API error creating ${location}: ${response.status}. ${organizationAccessHint(parsed.owner)}`,
					)
				}
				params.log(`Created ${location}.`)
				return
			}
			if (repoFiles === null) {
				// The Contents API can make a repo's first commit; Git Data cannot.
				const result = await writeRepoFile({
					token,
					location,
					path: 'README.md',
					content:
						'# ainvestor-catalog\n\nShared ETF catalog for the AI Investor app.\n',
					expectedVersion: null,
					message: 'Initialise the catalog repo',
				})
				if (!result.ok) {
					throw new Error(
						`GitHub API error initialising ${location}: ${result.status}`,
					)
				}
				params.log(`Initialised ${location} with a README.`)
			}
		},
	})
}
