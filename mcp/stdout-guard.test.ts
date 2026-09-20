import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

const originalConsoleLog = console.log
const originalConsoleInfo = console.info
const originalConsoleDebug = console.debug
const originalConsoleDir = console.dir
const originalConsoleTable = console.table
const originalConsoleError = console.error
const originalStdoutWrite = process.stdout.write
const originalStderrWrite = process.stderr.write

afterEach(() => {
	console.log = originalConsoleLog
	console.info = originalConsoleInfo
	console.debug = originalConsoleDebug
	console.dir = originalConsoleDir
	console.table = originalConsoleTable
	console.error = originalConsoleError
	process.stdout.write = originalStdoutWrite
	process.stderr.write = originalStderrWrite
})

function writeSpy(collected: unknown[]): typeof process.stdout.write {
	return ((chunk: unknown) => {
		collected.push(chunk)
		return true
	}) as typeof process.stdout.write
}

describe('mcp stdout guard', () => {
	it('redirects console.log/info/debug/dir/table to stderr, never stdout', async () => {
		const stdoutChunks: unknown[] = []
		const stderrChunks: unknown[] = []
		process.stdout.write = writeSpy(stdoutChunks)
		process.stderr.write = writeSpy(stderrChunks)

		// Dynamic import so the guard's module-scope patch runs after the spies
		// above are installed, reproducing the "import this first" ordering its
		// own doc comment requires — this is the module's entire contract, since
		// it has no exports of its own.
		await import('./stdout-guard.ts')

		assert.equal(console.log, console.error)
		assert.equal(console.info, console.error)
		assert.equal(console.debug, console.error)
		assert.equal(console.dir, console.error)
		assert.equal(console.table, console.error)

		console.log('stdout guard test: log')
		console.info('stdout guard test: info')
		console.debug('stdout guard test: debug')
		console.dir({ probe: true })
		console.table([{ probe: true }])

		assert.equal(
			stdoutChunks.length,
			0,
			'no console.* call reached process.stdout.write',
		)
		assert.equal(
			stderrChunks.length,
			5,
			'every patched console.* call reached process.stderr.write instead',
		)
	})
})
