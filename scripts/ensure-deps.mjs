import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const requiredPaths = [
	'node_modules/.bin/tsx',
	'node_modules/.bin/biome',
	'node_modules/remix/package.json',
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
