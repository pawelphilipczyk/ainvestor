import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getPreviewBuildChrome } from './preview-build-meta.ts'

const envKeys = [
	'FLY_APP_NAME',
	'PREVIEW_GIT_BRANCH',
	'PREVIEW_BUILD_ISO',
	'PREVIEW_GIT_SHA_SHORT',
] as const

function withPreviewEnv(
	overrides: Partial<Record<(typeof envKeys)[number], string | undefined>>,
	callback: () => void,
) {
	const saved: Partial<Record<(typeof envKeys)[number], string | undefined>> =
		{}
	for (const key of envKeys) {
		saved[key] = process.env[key]
	}
	try {
		for (const key of envKeys) {
			if (!(key in overrides)) continue
			const value = overrides[key]
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
		callback()
	} finally {
		for (const key of envKeys) {
			const value = saved[key]
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
}

describe('getPreviewBuildChrome', () => {
	it('returns null when not preview', () => {
		withPreviewEnv(
			{
				FLY_APP_NAME: 'ainvestor',
				PREVIEW_GIT_BRANCH: undefined,
				PREVIEW_BUILD_ISO: undefined,
				PREVIEW_GIT_SHA_SHORT: undefined,
			},
			() => {
				assert.equal(getPreviewBuildChrome(), null)
			},
		)
	})

	it('returns null in preview when no build metadata env vars are set', () => {
		withPreviewEnv(
			{
				FLY_APP_NAME: 'ainvestor-preview',
				PREVIEW_GIT_BRANCH: undefined,
				PREVIEW_BUILD_ISO: undefined,
				PREVIEW_GIT_SHA_SHORT: undefined,
			},
			() => {
				assert.equal(getPreviewBuildChrome(), null)
			},
		)
	})

	it('joins branch and build ISO when both are set', () => {
		withPreviewEnv(
			{
				FLY_APP_NAME: 'ainvestor-preview',
				PREVIEW_GIT_BRANCH: 'feature/foo',
				PREVIEW_BUILD_ISO: '2026-05-12T10:00:00Z',
				PREVIEW_GIT_SHA_SHORT: 'abc1234',
			},
			() => {
				const result = getPreviewBuildChrome()
				assert.deepEqual(result, {
					line: 'feature/foo · 2026-05-12T10:00:00Z',
					title: 'Commit abc1234',
				})
			},
		)
	})

	it('uses short commit as line when branch and builtAt are missing', () => {
		withPreviewEnv(
			{
				FLY_APP_NAME: 'ainvestor-preview',
				PREVIEW_GIT_BRANCH: undefined,
				PREVIEW_BUILD_ISO: undefined,
				PREVIEW_GIT_SHA_SHORT: 'deadbeef',
			},
			() => {
				const result = getPreviewBuildChrome()
				assert.deepEqual(result, {
					line: 'deadbeef',
					title: 'Commit deadbeef',
				})
			},
		)
	})
})
