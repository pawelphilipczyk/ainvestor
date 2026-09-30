/**
 * Copies the owner's data gist into their private data repo for one
 * environment. See `scripts/gist-to-repo-migration.ts` and Phase 3 of
 * `docs/STORAGE_MIGRATION_PLAN.md`.
 */
import {
	MIGRATION_USAGE,
	type MigrationOptions,
	parseMigrationArguments,
	runMigration,
} from './gist-to-repo-migration.ts'

let options: MigrationOptions | null = null
try {
	options = parseMigrationArguments(process.argv.slice(2))
} catch (error) {
	console.error(error instanceof Error ? error.message : error)
	console.error(MIGRATION_USAGE)
	process.exitCode = 1
}

const token = (process.env.GH_TOKEN ?? '').trim()
if (options !== null && token.length === 0) {
	console.error(
		'GH_TOKEN is not set. It needs the gist and repo scopes — for example GH_TOKEN=$(gh auth token).',
	)
	process.exitCode = 1
} else if (options !== null) {
	try {
		const succeeded = await runMigration({
			...options,
			token,
			log: (line) => console.log(line),
		})
		if (!succeeded) process.exitCode = 1
	} catch (error) {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = 1
	}
}
