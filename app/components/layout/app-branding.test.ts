import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import { AppBranding } from './app-branding.tsx'

describe('AppBranding', () => {
	it('renders app name as home link', async () => {
		const result = await renderToString(jsx(AppBranding, {}))
		assert.match(result, /AI Investor/)
		assert.match(result, /href="\/"/)
	})

	it('renders Preview chip when FLY_APP_NAME is ainvestor-preview', async () => {
		const previousFlyAppName = process.env.FLY_APP_NAME
		process.env.FLY_APP_NAME = 'ainvestor-preview'
		try {
			const result = await renderToString(jsx(AppBranding, {}))
			assert.match(result, /Preview/)
			assert.match(result, /role="status"/)
		} finally {
			if (previousFlyAppName === undefined) {
				delete process.env.FLY_APP_NAME
			} else {
				process.env.FLY_APP_NAME = previousFlyAppName
			}
		}
	})

	it('renders branch and build metadata next to Preview chip when env vars are set', async () => {
		const previousFlyAppName = process.env.FLY_APP_NAME
		const previousBranch = process.env.PREVIEW_GIT_BRANCH
		const previousBuiltAt = process.env.PREVIEW_BUILD_ISO
		const previousCommit = process.env.PREVIEW_GIT_SHA_SHORT
		process.env.FLY_APP_NAME = 'ainvestor-preview'
		process.env.PREVIEW_GIT_BRANCH = 'test-branch'
		process.env.PREVIEW_BUILD_ISO = '2026-01-02T00:00:00Z'
		process.env.PREVIEW_GIT_SHA_SHORT = 'a1b2c3d'
		try {
			const result = await renderToString(jsx(AppBranding, {}))
			assert.match(result, /test-branch · 2026-01-02T00:00:00Z/)
			assert.match(result, /title="Commit a1b2c3d"/)
		} finally {
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
			if (previousBranch === undefined) delete process.env.PREVIEW_GIT_BRANCH
			else process.env.PREVIEW_GIT_BRANCH = previousBranch
			if (previousBuiltAt === undefined) delete process.env.PREVIEW_BUILD_ISO
			else process.env.PREVIEW_BUILD_ISO = previousBuiltAt
			if (previousCommit === undefined) delete process.env.PREVIEW_GIT_SHA_SHORT
			else process.env.PREVIEW_GIT_SHA_SHORT = previousCommit
		}
	})
})
