import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// One entry per binary the npm scripts invoke directly. A path missing here is
// not a slow reinstall, it is a confusing failure: the probe passes, `npm ci`
// is skipped, and the next clause dies with "command not found".
const requiredPaths = [
	'node_modules/.bin/biome',
	'node_modules/.bin/cross-env',
	'node_modules/remix/dist/node-tsx.js',
]

const hasDependencies = requiredPaths.every((path) => existsSync(path))

if (hasDependencies) {
	process.exit(0)
}

console.log('[setup] Installing Node dependencies with npm ci...')

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const install = spawnSync(npmCommand, ['ci'], {
	stdio: 'inherit',
})

if (typeof install.status === 'number') {
	process.exit(install.status)
}

process.exit(1)
