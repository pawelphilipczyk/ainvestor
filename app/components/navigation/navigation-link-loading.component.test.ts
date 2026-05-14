import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { router } from '../../router.ts'

describe('navigation-link-loading component entry static file', () => {
	it('GET /components/navigation/navigation-link-loading.component.js returns 200', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		assert.equal(response.status, 200)
	})

	it('GET /components/navigation/navigation-link-loading.component.js returns javascript content-type', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('component entry exports NavigationLinkLoadingEnhancement via clientEntry', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.match(body, /clientEntry/)
		assert.match(body, /NavigationLinkLoadingEnhancement/)
	})

	it('component entry imports from remix/ui', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.match(body, /from 'remix\/ui'/)
	})

	it('component entry wires document click listeners via handle.signal', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.match(body, /addEventListeners/)
		assert.match(body, /handle\.signal/)
		assert.match(body, /addEventListeners\(doc, handle\.signal/)
	})

	it('component sets data-loading and aria-busy on clicked anchor', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.match(body, /data-loading/)
		assert.match(body, /aria-busy/)
	})

	it('component uses requestAnimationFrame to assign location', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.match(body, /requestAnimationFrame/)
		assert.match(body, /location\.assign/)
	})

	it('component renders a hidden span as its DOM element', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.match(body, /createElement/)
		assert.match(body, /data-component.*navigation-link-loading-enhancement|navigation-link-loading-enhancement.*data-component/)
	})

	it('component no longer uses isNavigating guard (removed in simplification)', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.doesNotMatch(body, /isNavigating/)
	})

	it('component no longer imports navigate from remix/ui (removed in simplification)', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		// The new import list should not include navigate
		assert.doesNotMatch(body, /,\s*navigate\b|\bnavigate\s*,/)
	})

	it('component no longer uses usesNativeNavigationApi (removed in simplification)', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.doesNotMatch(body, /usesNativeNavigationApi/)
	})

	it('component no longer adds pageshow listener (removed in simplification)', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.doesNotMatch(body, /pageshow/)
	})

	it('component no longer has clearAnchorNavigationBusy helper (removed in simplification)', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/navigation-link-loading.component.js',
		)
		const body = await response.text()
		assert.doesNotMatch(body, /clearAnchorNavigationBusy/)
	})
})