import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { describeMcpConfig, resolveMcpConfig } from './config.ts'

const validEnv = { GH_TOKEN: 'token-value' } satisfies NodeJS.ProcessEnv

describe('mcp config', () => {
	it('resolves the required variables', () => {
		const config = resolveMcpConfig(validEnv)
		assert.equal(config.githubToken, 'token-value')
		assert.equal(config.dataGistId, null)
	})

	it('throws an actionable error when GH_TOKEN is missing', () => {
		assert.throws(
			() => resolveMcpConfig({ SHARED_CATALOG_GIST_ID: 'catalog-gist' }),
			/GH_TOKEN is not set.*gist. scope/s,
		)
	})

	it('needs nothing but the token', () => {
		const config = resolveMcpConfig({ GH_TOKEN: 'token-value' })
		assert.equal(config.githubToken, 'token-value')
	})

	it('treats whitespace-only values as missing', () => {
		assert.throws(
			() => resolveMcpConfig({ ...validEnv, GH_TOKEN: '   ' }),
			/GH_TOKEN is not set/,
		)
	})

	it('picks up an explicitly pinned data gist id', () => {
		const config = resolveMcpConfig({
			...validEnv,
			AINVESTOR_GIST_ID: 'pinned',
		})
		assert.equal(config.dataGistId, 'pinned')
	})

	it('never exposes the token in the config summary', () => {
		const summary = describeMcpConfig(resolveMcpConfig(validEnv))
		assert.equal(JSON.stringify(summary).includes('token-value'), false)
		assert.equal(summary.githubTokenPresent, true)
		assert.equal(summary.dataGistSource, 'discovered')
	})
})
