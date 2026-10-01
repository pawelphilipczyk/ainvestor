import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { describeMcpConfig, resolveMcpConfig } from './config.ts'

const validEnv = {
	GH_TOKEN: 'token-value',
} satisfies NodeJS.ProcessEnv

describe('mcp config', () => {
	it('resolves the required variables', () => {
		const config = resolveMcpConfig(validEnv)
		assert.equal(config.githubToken, 'token-value')
		assert.equal(config.dataRepo, null)
	})

	it('throws an actionable error when GH_TOKEN is missing', () => {
		assert.throws(
			() => resolveMcpConfig({}),
			/GH_TOKEN is not set.*`gist` and `repo` scopes/s,
		)
	})

	it('reads the catalog from the shared repo unless SHARED_CATALOG_REPO points elsewhere', () => {
		assert.equal(
			resolveMcpConfig(validEnv).sharedCatalogRepo,
			'ainvestor-shared/ainvestor-catalog',
		)
		assert.equal(
			resolveMcpConfig({ ...validEnv, SHARED_CATALOG_REPO: 'me/my-catalog' })
				.sharedCatalogRepo,
			'me/my-catalog',
		)
	})

	it('treats whitespace-only values as missing', () => {
		assert.throws(
			() => resolveMcpConfig({ ...validEnv, GH_TOKEN: '   ' }),
			/GH_TOKEN is not set/,
		)
	})

	it('picks up an explicitly pinned data repo', () => {
		const config = resolveMcpConfig({
			...validEnv,
			AINVESTOR_DATA_REPO: 'octocat/ainvestor-data',
		})
		assert.equal(config.dataRepo, 'octocat/ainvestor-data')
	})

	it('never exposes the token in the config summary', () => {
		const summary = describeMcpConfig(resolveMcpConfig(validEnv))
		assert.equal(JSON.stringify(summary).includes('token-value'), false)
		assert.equal(summary.githubTokenPresent, true)
		assert.equal(summary.dataRepoSource, 'token owner')
	})
})
