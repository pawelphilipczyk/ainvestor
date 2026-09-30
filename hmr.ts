/**
 * Dev-loop entry point, replacing the plain `tsx watch server.ts` restart
 * loop. `remix/node-hmr` still restarts the child process for any change it
 * cannot apply in place (the same behavior `tsx watch` always had); modules
 * `remix/ui-hmr/node` can transform — Remix UI server components — hot-swap
 * without a restart instead. See `docs/REMIX_RC_MIGRATION_PLAN.md` Stage 7.
 */
import { run } from 'remix/node-hmr'

run('./server.ts', {
	nodeArgs: ['--import', 'remix/node-tsx', '--import', 'remix/ui-hmr/node'],
	watch: {
		ignore: ['**/node_modules/**'],
	},
})
