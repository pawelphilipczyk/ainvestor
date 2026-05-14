import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { router } from '../../router.ts'

describe('advice-export-copy component entry static file', () => {
	it('GET /features/advice/advice-export-copy.component.js returns 200', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		assert.equal(response.status, 200)
	})

	it('GET /features/advice/advice-export-copy.component.js returns javascript content-type', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('component entry exports AdviceExportCopyInteractions via clientEntry', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /clientEntry/)
		assert.match(body, /AdviceExportCopyInteractions/)
	})

	it('component entry wires document click listeners via handle.signal', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /addEventListeners/)
		assert.match(body, /handle\.signal/)
		assert.match(body, /addEventListeners\(document, handle\.signal/)
	})

	it('component entry imports from remix/ui', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /from 'remix\/ui'/)
	})

	it('component targets copy button via data-advice-export-copy selector', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /data-advice-export-copy/)
	})

	it('component reads text from data-advice-export-text element', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /data-advice-export-text/)
	})

	it('component uses navigator.clipboard for copying', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /navigator\.clipboard/)
	})

	it('component falls back to execCommand copy', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /execCommand/)
	})

	it('component renders a hidden span as its DOM element', async () => {
		const response = await router.fetch(
			'http://localhost/features/advice/advice-export-copy.component.js',
		)
		const body = await response.text()
		assert.match(body, /createElement/)
		assert.match(body, /data-component.*advice-export-copy-interactions|advice-export-copy-interactions.*data-component/)
	})
})