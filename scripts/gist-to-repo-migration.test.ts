import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
	ForeignRepoError,
	REPO_MARKER_CONTENT,
	REPO_MARKER_PATH,
} from '../app/lib/store/github-repo-store.ts'
import {
	migrationTargetNames,
	missingScopes,
	parseMigrationArguments,
	planFileCopies,
	runCatalogMigration,
	runMigration,
	setBranchPollForTests,
} from './gist-to-repo-migration.ts'

setBranchPollForTests(0)

let previousFetch: typeof fetch | undefined

afterEach(() => {
	if (previousFetch) globalThis.fetch = previousFetch
	previousFetch = undefined
})

function base64(text: string): string {
	return Buffer.from(text, 'utf-8').toString('base64')
}

function fromBase64(text: string): string {
	return Buffer.from(text, 'base64').toString('utf-8')
}

type FakeGithub = {
	login: string
	/** `X-OAuth-Scopes` header value; `null` sends none (a fine-grained token). */
	scopes: string | null
	gist: {
		id: string
		description: string
		files: Record<string, string>
	} | null
	repoName: string
	/** Owner of the target repo; the token's own login when unset. */
	repoOwner?: string
	/** `permissions.push` on the target repo. Defaults to true. */
	canWrite?: boolean
	/** The repo exists but has no commits: its root listing answers 404. */
	repoEmpty?: boolean
	/** How many branch reads answer 409 before the branch is readable, as just after creation. */
	branchUnreadyReads?: number
	/** Status for the repo lookup itself, as an organization's OAuth restriction gives. */
	repoLookupStatus?: number
	/** `null` until the repo exists. The marker lives here like any other file. */
	repoFiles: Map<string, string> | null
	/** Every non-GET request, as `METHOD /path`. */
	mutations: string[]
	/** Simulates a write that lands wrong, to exercise verification. */
	corruptOnWrite?: boolean
	/** Runs before each `GET /gists/{id}`, with how many came before it. */
	beforeGistRead?: (previousReads: number) => void
}

/**
 * The GitHub endpoints this script touches, backed by in-memory state — enough
 * for gist discovery and reads, repo lookup/creation, Contents reads and
 * writes, and one Git Data commit (blobs → tree → commit → ref update).
 */
function installFakeGithub(state: FakeGithub) {
	const blobs = new Map<string, string>()
	let pendingTree: Array<{ path: string; sha: string | null }> = []
	let gistReads = 0
	previousFetch = globalThis.fetch
	globalThis.fetch = async (input, init) => {
		const url = new URL(String(input))
		const method = init?.method ?? 'GET'
		const path = url.pathname
		const body =
			typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
		if (method !== 'GET') state.mutations.push(`${method} ${path}`)

		const repoOwner = state.repoOwner ?? state.login
		const repoPrefix = `/repos/${repoOwner}/${state.repoName}`
		const notFound = () => new Response(null, { status: 404 })

		if (method === 'GET' && path === '/user') {
			return Response.json(
				{ login: state.login },
				{
					headers:
						state.scopes === null ? {} : { 'x-oauth-scopes': state.scopes },
				},
			)
		}
		if (method === 'GET' && path === '/gists') {
			return Response.json(
				state.gist
					? [{ id: state.gist.id, description: state.gist.description }]
					: [],
			)
		}
		if (method === 'GET' && state.gist && path === `/gists/${state.gist.id}`) {
			state.beforeGistRead?.(gistReads)
			gistReads += 1
			return Response.json({
				files: Object.fromEntries(
					Object.entries(state.gist.files).map(([name, content]) => [
						name,
						{ content },
					]),
				),
			})
		}
		if (method === 'GET' && path === repoPrefix) {
			if (state.repoLookupStatus !== undefined) {
				return new Response(null, { status: state.repoLookupStatus })
			}
			return state.repoFiles
				? Response.json({
						default_branch: 'main',
						permissions: { pull: true, push: state.canWrite ?? true },
					})
				: notFound()
		}
		if (method === 'POST' && path === '/user/repos') {
			state.repoFiles = new Map([['README.md', '# ainvestor-data\n']])
			return Response.json({}, { status: 201 })
		}
		if (method === 'POST' && path === `/orgs/${repoOwner}/repos`) {
			state.repoFiles = new Map([['README.md', `# ${body.name}\n`]])
			return Response.json({}, { status: 201 })
		}
		if (method === 'GET' && path === `${repoPrefix}/contents/`) {
			if (!state.repoFiles || state.repoEmpty) return notFound()
			return Response.json(
				[...state.repoFiles.keys()].map((name) => ({
					type: 'file',
					name,
					path: name,
				})),
			)
		}
		if (path.startsWith(`${repoPrefix}/contents/`)) {
			const filePath = path.slice(`${repoPrefix}/contents/`.length)
			if (!state.repoFiles) return notFound()
			if (method === 'GET') {
				const content = state.repoFiles.get(filePath)
				return content === undefined
					? notFound()
					: Response.json({
							content: base64(content),
							encoding: 'base64',
							sha: `sha-${filePath}`,
						})
			}
			if (method === 'PUT') {
				state.repoEmpty = false
				state.repoFiles.set(filePath, fromBase64(body.content))
				return Response.json({ content: { sha: `sha-${filePath}` } })
			}
		}
		if (method === 'GET' && path === `${repoPrefix}/git/ref/heads/main`) {
			if ((state.branchUnreadyReads ?? 0) > 0) {
				state.branchUnreadyReads = (state.branchUnreadyReads ?? 0) - 1
				return new Response(null, { status: 409 })
			}
			return Response.json({ object: { sha: 'commit-0' } })
		}
		if (method === 'GET' && path === `${repoPrefix}/git/commits/commit-0`) {
			return Response.json({ tree: { sha: 'tree-0' } })
		}
		if (method === 'GET' && path === `${repoPrefix}/git/trees/tree-0`) {
			return Response.json({
				tree: [...(state.repoFiles?.keys() ?? [])].map((name) => ({
					path: name,
					type: 'blob',
				})),
			})
		}
		if (method === 'POST' && path === `${repoPrefix}/git/blobs`) {
			const sha = `blob-${blobs.size + 1}`
			blobs.set(sha, body.content)
			return Response.json({ sha })
		}
		if (method === 'POST' && path === `${repoPrefix}/git/trees`) {
			pendingTree = body.tree
			return Response.json({ sha: 'tree-1' })
		}
		if (method === 'POST' && path === `${repoPrefix}/git/commits`) {
			return Response.json({ sha: 'commit-1' })
		}
		if (method === 'PATCH' && path === `${repoPrefix}/git/refs/heads/main`) {
			for (const entry of pendingTree) {
				if (entry.sha === null) state.repoFiles?.delete(entry.path)
				else {
					const content = blobs.get(entry.sha) ?? ''
					state.repoFiles?.set(
						entry.path,
						state.corruptOnWrite ? `${content} (corrupted)` : content,
					)
				}
			}
			return Response.json({ object: { sha: 'commit-1' } })
		}
		throw new Error(`unexpected request: ${method} ${path}`)
	}
}

const GIST_FILES = {
	'etfs.json': '[{"id":"1","name":"Fund","value":100,"currency":"PLN"}]',
	'guidelines.json': '[]',
	'advice-buy-next.json': '{"text":"Zażółć"}',
}

function fakeGithub(overrides: Partial<FakeGithub> = {}): FakeGithub {
	return {
		login: 'octocat',
		scopes: 'gist, repo',
		gist: {
			id: 'gist-1',
			description: 'ai-investor-data',
			files: { ...GIST_FILES },
		},
		repoName: 'ainvestor-data',
		repoFiles: null,
		mutations: [],
		...overrides,
	}
}

function markedRepo(files: Record<string, string>): Map<string, string> {
	return new Map([
		['README.md', '# ainvestor-data\n'],
		[REPO_MARKER_PATH, REPO_MARKER_CONTENT],
		...Object.entries(files),
	])
}

async function migrate(
	state: FakeGithub,
	options: { apply?: boolean; force?: boolean } = {},
) {
	installFakeGithub(state)
	const lines: string[] = []
	const succeeded = await runMigration({
		environment: 'prod',
		apply: options.apply ?? false,
		force: options.force ?? false,
		token: 'test-token',
		log: (line) => lines.push(line),
	})
	return { succeeded, output: lines.join('\n') }
}

function commitCount(state: FakeGithub): number {
	return state.mutations.filter((mutation) =>
		mutation.startsWith('PATCH /repos/octocat/ainvestor-data/git/refs/'),
	).length
}

describe('parseMigrationArguments', () => {
	it('reads --env and the two switches', () => {
		assert.deepEqual(
			parseMigrationArguments(['--env', 'preview', '--apply', '--force']),
			{ kind: 'data', environment: 'preview', apply: true, force: true },
		)
	})

	it('defaults to a dry run without --force', () => {
		assert.deepEqual(parseMigrationArguments(['--env=prod']), {
			kind: 'data',
			environment: 'prod',
			apply: false,
			force: false,
		})
	})

	it('requires --env to name a known environment', () => {
		assert.throws(() => parseMigrationArguments([]), /--env/)
		assert.throws(() => parseMigrationArguments(['--env', 'staging']), /--env/)
	})

	it('rejects an unknown flag rather than ignoring a typo', () => {
		assert.throws(() => parseMigrationArguments(['--env', 'prod', '--aply']))
	})

	it('reads --catalog with the gist to copy, and no environment', () => {
		assert.deepEqual(
			parseMigrationArguments(['--catalog', '--gist', 'abc123', '--apply']),
			{ kind: 'catalog', gistId: 'abc123', apply: true, force: false },
		)
	})

	it('refuses --catalog without a gist, or with an environment', () => {
		assert.throws(() => parseMigrationArguments(['--catalog']), /--gist/)
		assert.throws(
			() => parseMigrationArguments(['--catalog', '--gist', 'a/b']),
			/--gist/,
		)
		assert.throws(
			() =>
				parseMigrationArguments([
					'--catalog',
					'--gist',
					'abc',
					'--env',
					'prod',
				]),
			/share one catalog repo/,
		)
		assert.throws(
			() => parseMigrationArguments(['--env', 'prod', '--gist', 'abc']),
			/only goes with --catalog/,
		)
	})
})

describe('migrationTargetNames', () => {
	it('maps each environment to its own gist and repo', () => {
		assert.deepEqual(migrationTargetNames('prod'), {
			gistDescription: 'ai-investor-data',
			repoName: 'ainvestor-data',
		})
		assert.deepEqual(migrationTargetNames('preview'), {
			gistDescription: 'ai-investor-preview-data',
			repoName: 'ainvestor-preview-data',
		})
	})
})

describe('missingScopes', () => {
	it('names whichever of gist and repo is absent', () => {
		assert.deepEqual(missingScopes(['gist']), ['repo'])
		assert.deepEqual(missingScopes([]), ['gist', 'repo'])
		assert.deepEqual(missingScopes(['read:org', 'repo', 'gist']), [])
	})

	it('skips the check when the token reports no scopes at all', () => {
		assert.deepEqual(missingScopes(null), [])
	})
})

describe('planFileCopies', () => {
	it('marks each file create, unchanged, overwrite or delete, sized in UTF-8 bytes', () => {
		assert.deepEqual(
			planFileCopies({
				gistFiles: { 'a.json': 'zł', 'b.json': 'same', 'c.json': 'new' },
				repoFiles: { 'b.json': 'same', 'c.json': 'old', 'd.json': 'gone' },
			}),
			[
				{ path: 'a.json', bytes: 3, action: 'create' },
				{ path: 'b.json', bytes: 4, action: 'unchanged' },
				{ path: 'c.json', bytes: 3, action: 'overwrite' },
				{ path: 'd.json', bytes: 4, action: 'delete' },
			],
		)
	})
})

describe('runMigration', () => {
	it('dry run: reports the plan and changes nothing, not even creating the repo', async () => {
		const state = fakeGithub()
		const { succeeded, output } = await migrate(state)
		assert.equal(succeeded, true)
		assert.deepEqual(state.mutations, [])
		assert.equal(state.repoFiles, null)
		assert.match(output, /octocat\/ainvestor-data \(does not exist yet\)/)
		assert.match(output, /create {4}etfs\.json/)
		assert.match(output, /Rerun with --apply to write 3 change/)
	})

	it('apply: creates the repo, copies every file in one commit, and verifies', async () => {
		const state = fakeGithub()
		const { succeeded, output } = await migrate(state, { apply: true })
		assert.equal(succeeded, true)
		assert.equal(state.repoFiles?.get(REPO_MARKER_PATH), REPO_MARKER_CONTENT)
		for (const [path, content] of Object.entries(GIST_FILES)) {
			assert.equal(state.repoFiles?.get(path), content, path)
		}
		assert.equal(commitCount(state), 1)
		assert.match(output, /Verified: the 3 data file\(s\)/)
	})

	it('never writes to the gist', async () => {
		const state = fakeGithub()
		await migrate(state, { apply: true, force: true })
		assert.deepEqual(
			state.mutations.filter((mutation) => mutation.includes('/gists')),
			[],
		)
	})

	it('copies every file the gist lists, not a fixed set', async () => {
		const state = fakeGithub()
		if (state.gist) state.gist.files['notes-nobody-remembered.json'] = '{}'
		await migrate(state, { apply: true })
		assert.equal(state.repoFiles?.get('notes-nobody-remembered.json'), '{}')
	})

	it('does nothing when the repo already matches the gist', async () => {
		const state = fakeGithub({ repoFiles: markedRepo(GIST_FILES) })
		const { succeeded, output } = await migrate(state, { apply: true })
		assert.equal(succeeded, true)
		assert.deepEqual(state.mutations, [])
		assert.match(output, /Verified/)
	})

	it('refuses to replace a repo file that differs, even with --apply', async () => {
		const state = fakeGithub({
			repoFiles: markedRepo({ ...GIST_FILES, 'etfs.json': '[]' }),
		})
		const { succeeded, output } = await migrate(state, { apply: true })
		assert.equal(succeeded, false)
		assert.deepEqual(state.mutations, [])
		assert.equal(state.repoFiles?.get('etfs.json'), '[]')
		assert.match(output, /overwrite etfs\.json/)
		assert.match(output, /--force/)
	})

	it('--force replaces differing files, writing only what changed', async () => {
		const state = fakeGithub({
			repoFiles: markedRepo({ ...GIST_FILES, 'etfs.json': '[]' }),
		})
		const { succeeded } = await migrate(state, { apply: true, force: true })
		assert.equal(succeeded, true)
		assert.equal(state.repoFiles?.get('etfs.json'), GIST_FILES['etfs.json'])
		assert.equal(commitCount(state), 1)
		assert.equal(
			state.mutations.filter((mutation) => mutation.endsWith('/git/blobs'))
				.length,
			1,
		)
	})

	it("never plans the ownership marker or GitHub's README as leftover data", async () => {
		const state = fakeGithub({ repoFiles: markedRepo(GIST_FILES) })
		const { output } = await migrate(state)
		assert.doesNotMatch(output, /README\.md|\.ainvestor\.json/)
	})

	it('refuses to delete a repo file the gist no longer has, without --force', async () => {
		const state = fakeGithub({
			repoFiles: markedRepo({
				...GIST_FILES,
				'advice-analysis.json': '{"cleared":"since"}',
			}),
		})
		const { succeeded, output } = await migrate(state, { apply: true })
		assert.equal(succeeded, false)
		assert.deepEqual(state.mutations, [])
		assert.match(output, /delete {4}advice-analysis\.json/)
	})

	it('--force deletes a repo file the gist no longer has, then verifies the full set', async () => {
		const state = fakeGithub({
			repoFiles: markedRepo({
				...GIST_FILES,
				'advice-analysis.json': '{"cleared":"since"}',
			}),
		})
		const { succeeded, output } = await migrate(state, {
			apply: true,
			force: true,
		})
		assert.equal(succeeded, true)
		assert.equal(state.repoFiles?.has('advice-analysis.json'), false)
		assert.equal(state.repoFiles?.get(REPO_MARKER_PATH), REPO_MARKER_CONTENT)
		assert.equal(commitCount(state), 1)
		assert.match(output, /Verified/)
	})

	it('fails when the gist changes during the run, instead of claiming a match', async () => {
		const state = fakeGithub({
			beforeGistRead: (previousReads) => {
				// Reads 0 and 1 are the initial listing and read; anything later is
				// the end-of-run re-check, by which time someone has edited.
				if (previousReads >= 2 && state.gist) {
					state.gist.files['guidelines.json'] = '[{"edited":"mid-run"}]'
				}
			},
		})
		const { succeeded, output } = await migrate(state, { apply: true })
		assert.equal(succeeded, false)
		assert.match(output, /gist changed during this run \(guidelines\.json\)/)
	})

	it('reports failure when a copied file does not read back identically', async () => {
		const state = fakeGithub({ corruptOnWrite: true })
		const { succeeded, output } = await migrate(state, { apply: true })
		assert.equal(succeeded, false)
		assert.match(output, /Verification FAILED/)
	})

	it('refuses a same-named repo this app did not create', async () => {
		const state = fakeGithub({
			repoFiles: new Map([['README.md', 'someone else']]),
		})
		await assert.rejects(migrate(state, { apply: true }), ForeignRepoError)
		assert.deepEqual(state.mutations, [])
	})

	it('stops before touching anything when the token lacks the repo scope', async () => {
		const state = fakeGithub({ scopes: 'gist' })
		await assert.rejects(migrate(state, { apply: true }), /repo scope/)
		assert.deepEqual(state.mutations, [])
	})

	it('stops when no gist has the environment description', async () => {
		const state = fakeGithub({ gist: null })
		await assert.rejects(migrate(state), /No gist described "ai-investor-data"/)
	})
})

describe('runCatalogMigration', () => {
	const CATALOG_GIST_FILES = {
		'catalog.json': '[{"id":"t:VWCE","ticker":"VWCE"}]',
		'catalog-source.json': '{"t:VWCE":{"ticker":"VWCE"}}',
	}

	function catalogGithub(overrides: Partial<FakeGithub> = {}): FakeGithub {
		return fakeGithub({
			gist: {
				id: 'catalog-gist',
				description: 'shared catalog',
				files: { ...CATALOG_GIST_FILES },
			},
			repoOwner: 'ainvestor-shared',
			repoName: 'ainvestor-catalog',
			...overrides,
		})
	}

	async function migrateCatalog(
		state: FakeGithub,
		options: { apply?: boolean; force?: boolean; gistId?: string } = {},
	) {
		installFakeGithub(state)
		const lines: string[] = []
		const succeeded = await runCatalogMigration({
			gistId: options.gistId ?? 'catalog-gist',
			apply: options.apply ?? false,
			force: options.force ?? false,
			token: 'test-token',
			log: (line) => lines.push(line),
		})
		return { succeeded, output: lines.join('\n') }
	}

	it('dry run: plans both catalog files and creates nothing', async () => {
		const state = catalogGithub()
		const { succeeded, output } = await migrateCatalog(state)
		assert.equal(succeeded, true)
		assert.match(
			output,
			/Target: +ainvestor-shared\/ainvestor-catalog \(does not exist yet/,
		)
		assert.match(output, /create +catalog\.json/)
		assert.match(output, /create +catalog-source\.json/)
		assert.deepEqual(state.mutations, [])
	})

	it('apply: creates the private repo in the organization, copies in one commit, and verifies', async () => {
		const state = catalogGithub()
		const { succeeded, output } = await migrateCatalog(state, { apply: true })
		assert.equal(succeeded, true)
		assert.equal(state.mutations[0], 'POST /orgs/ainvestor-shared/repos')
		assert.equal(
			state.repoFiles?.get('catalog.json'),
			CATALOG_GIST_FILES['catalog.json'],
		)
		assert.equal(
			state.mutations.filter((mutation) => mutation.includes('/git/refs/'))
				.length,
			1,
		)
		assert.match(
			output,
			/Verified: the 2 data file\(s\) in ainvestor-shared\/ainvestor-catalog/,
		)
		assert.equal(
			state.mutations.some((mutation) => mutation.startsWith('PATCH /gists')),
			false,
		)
	})

	it('initialises an existing repo that has no commits before copying into it', async () => {
		const state = catalogGithub({ repoFiles: new Map(), repoEmpty: true })
		const { succeeded, output } = await migrateCatalog(state, { apply: true })
		assert.equal(succeeded, true)
		assert.match(output, /Initialised ainvestor-shared\/ainvestor-catalog/)
		assert.equal(state.repoFiles?.has('catalog.json'), true)
	})

	it('refuses to overwrite a catalog already in the repo, without --force', async () => {
		const state = catalogGithub({
			repoFiles: new Map([
				['README.md', '# ainvestor-catalog'],
				['catalog.json', '[]'],
			]),
		})
		const { succeeded, output } = await migrateCatalog(state, { apply: true })
		assert.equal(succeeded, false)
		assert.match(output, /Refusing/)
		assert.equal(state.repoFiles?.get('catalog.json'), '[]')
	})

	it('stops when the token can read the repo but not push to it', async () => {
		const state = catalogGithub({
			repoFiles: new Map([['README.md', '# ainvestor-catalog']]),
			canWrite: false,
		})
		await assert.rejects(
			migrateCatalog(state, { apply: true }),
			/not push to it/,
		)
		assert.deepEqual(state.mutations, [])
	})

	it('leaves non-JSON files a maintainer created with the repo alone, even with --force', async () => {
		const state = catalogGithub({
			repoFiles: new Map([
				['README.md', '# ainvestor-catalog'],
				['LICENSE', 'MIT'],
				['.gitignore', 'node_modules'],
			]),
		})
		const { succeeded, output } = await migrateCatalog(state, {
			apply: true,
			force: true,
		})
		assert.equal(succeeded, true)
		assert.doesNotMatch(output, /delete/)
		assert.equal(state.repoFiles?.get('LICENSE'), 'MIT')
		assert.equal(state.repoFiles?.get('.gitignore'), 'node_modules')
	})

	it('waits for a just-created repo’s branch before committing to it', async () => {
		const state = catalogGithub({ branchUnreadyReads: 2 })
		const { succeeded } = await migrateCatalog(state, { apply: true })
		assert.equal(succeeded, true)
		assert.equal(state.repoFiles?.has('catalog.json'), true)
	})

	it('names the organization setting when GitHub refuses the repo lookup', async () => {
		const state = catalogGithub({ repoLookupStatus: 403 })
		await assert.rejects(
			migrateCatalog(state, { apply: true }),
			/403.*Third-party access/s,
		)
		assert.deepEqual(state.mutations, [])
	})

	it('refuses a gist without catalog.json, which is the wrong id', async () => {
		const state = catalogGithub({
			gist: {
				id: 'data-gist',
				description: 'ai-investor-data',
				files: { ...GIST_FILES },
			},
		})
		await assert.rejects(
			migrateCatalog(state, { apply: true, gistId: 'data-gist' }),
			/not a catalog gist/,
		)
		assert.deepEqual(state.mutations, [])
	})
})
