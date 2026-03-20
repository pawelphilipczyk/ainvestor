import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { AppBranding } from './app-branding.tsx'

describe('AppBranding', () => {
	it('renders app name', async () => {
		const result = await renderToString(jsx(AppBranding, {}))
		assert.match(result, /AI Investor/)
	})

	it('renders Preview chip when FLY_APP_NAME is ainvestor-preview', async () => {
		const prev = process.env.FLY_APP_NAME
		process.env.FLY_APP_NAME = 'ainvestor-preview'
		try {
			const result = await renderToString(jsx(AppBranding, {}))
			assert.match(result, /Preview/)
			assert.match(result, /role="status"/)
		} finally {
			if (prev === undefined) {
				delete process.env.FLY_APP_NAME
			} else {
				process.env.FLY_APP_NAME = prev
			}
		}
	})
})
