import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { router } from '../../router.ts'

describe('document-shell client messages', () => {
	it('includes adviceContextCopySuccess in the ui-client-messages script', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /adviceContextCopySuccess/)
		assert.match(body, /Copied to clipboard/)
	})

	it('includes adviceContextCopyFailed in the ui-client-messages script', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /adviceContextCopyFailed/)
		assert.match(body, /Automatic copy failed/)
	})

	it('ui-client-messages script contains valid JSON with all expected keys', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		const match = body.match(
			/<script[^>]*id="ui-client-messages"[^>]*>([^<]+)<\/script>/,
		)
		assert.ok(match !== null, 'ui-client-messages script element not found')
		const parsed = JSON.parse(match[1] ?? '{}') as Record<string, unknown>
		assert.ok(
			typeof parsed.genericFormError === 'string',
			'genericFormError should be a string',
		)
		assert.ok(
			typeof parsed.submitLoadingLabel === 'string',
			'submitLoadingLabel should be a string',
		)
		assert.ok(
			typeof parsed.adviceContextCopySuccess === 'string',
			'adviceContextCopySuccess should be a string',
		)
		assert.ok(
			typeof parsed.adviceContextCopyFailed === 'string',
			'adviceContextCopyFailed should be a string',
		)
	})
})