/**
 * Copies a gist into a repo: the owner's data gist for one environment, or
 * (with `--catalog`) the shared catalog gist into the organization's catalog
 * repo. See `scripts/gist-to-repo-migration.ts` and Phases 3 and 6 of
 * `docs/STORAGE_MIGRATION_PLAN.md`.
 */
import {
	MIGRATION_USAGE,
	type ParsedMigrationArguments,
	parseMigrationArguments,
	runCatalogMigration,
	runMigration,
} from './gist-to-repo-migration.ts'

let options: ParsedMigrationArguments | null = null
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
	const log = (line: string) => console.log(line)
	try {
		const succeeded =
			options.kind === 'catalog'
				? await runCatalogMigration({ ...options, token, log })
				: await runMigration({ ...options, token, log })
		if (!succeeded) process.exitCode = 1
	} catch (error) {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = 1
	}
}
