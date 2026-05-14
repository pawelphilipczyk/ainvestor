import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { router } from '../../router.ts'

describe('advice-context-copy.component.js static file', () => {
	it('is served at /features/advice/advice-context-copy.component.js with 200', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-context-copy.component.js',
		)
		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('registers a clientEntry export named AdviceContextCopyEnhancement', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-context-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /clientEntry/)
		assert.match(body, /AdviceContextCopyEnhancement/)
	})

	it('listens for click events on [data-copy-llm-markdown] triggers', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-context-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /data-copy-llm-markdown/)
	})

	it('listens for click events on [data-copy-llm-catalog-json] triggers', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-context-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /data-copy-llm-catalog-json/)
	})

	it('listens for click events on [data-copy-llm-both] triggers', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-context-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /data-copy-llm-both/)
	})

	it('uses navigator.clipboard.writeText for copying', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-context-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /navigator\.clipboard\.writeText/)
	})

	it('reads success/failure messages from ui-client-messages element', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-context-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /adviceContextCopySuccess/)
		assert.match(body, /adviceContextCopyFailed/)
	})

	it('uses handle.signal for event listener lifecycle', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-context-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /handle\.signal/)
		assert.match(body, /addEventListeners/)
	})

	it('combines markdown and catalog JSON with a separator for data-copy-llm-both', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-context-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /ETF catalog \(JSON\)/)
	})
})