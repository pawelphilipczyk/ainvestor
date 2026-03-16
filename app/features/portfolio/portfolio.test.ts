import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { resetEtfEntries } from './index.ts'

afterEach(() => {
	resetEtfEntries()
})

describe('Health endpoint', () => {
	it('returns ok', async () => {
		const response = await router.fetch('http://localhost/health')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.equal(body, 'ok')
	})
})

describe('Island loader in page shell', () => {
	it('body has data-island="sidebar" so the island loader activates it', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.match(body, /<body[^>]*data-island="sidebar"/)
	})

	it('page shell includes an island loader script', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.match(body, /data-island/)
		assert.match(body, /\/islands\//)
	})

	it('page shell does not contain inline sidebar or theme-toggle logic', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.doesNotMatch(body, /openSidebar/)
		assert.doesNotMatch(body, /closeSidebar/)
		assert.doesNotMatch(body, /localStorage\.setItem\('theme'/)
	})
})

describe('Island static files', () => {
	it('GET /islands/sidebar.js serves the sidebar island', async () => {
		const response = await router.fetch('http://localhost/islands/sidebar.js')

		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('GET /islands/theme-toggle.js serves the theme-toggle island', async () => {
		const response = await router.fetch(
			'http://localhost/islands/theme-toggle.js',
		)

		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('GET /islands/sidebar.ts returns 404 (TypeScript source not exposed)', async () => {
		const response = await router.fetch('http://localhost/islands/sidebar.ts')

		assert.equal(response.status, 404)
	})
})

describe('Portfolio page', () => {
	it('GET / sets Cache-Control: no-store so browsers always fetch a fresh ETF list', async () => {
		const response = await router.fetch('http://localhost/')

		assert.equal(response.headers.get('cache-control'), 'no-store')
	})

	it('renders the homepage and ETF form', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /AI Investor/)
		assert.match(body, /<form[^>]*method="post"[^>]*action="\/etfs"/)
	})

	it('form has name, value and currency fields', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.match(body, /name="etfName"/)
		assert.match(body, /name="value"/)
		assert.match(body, /name="currency"/)
	})

	it('adds an ETF on form submit and displays it on homepage', async () => {
		const form = new FormData()
		form.set('etfName', 'VTI')
		form.set('value', '1200.50')
		form.set('currency', 'USD')

		const postResponse = await router.fetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)

		assert.equal(postResponse.status, 302)
		assert.equal(postResponse.headers.get('location'), '/')

		const homeResponse = await router.fetch('http://localhost/')
		const homeBody = await homeResponse.text()

		assert.match(homeBody, /VTI/)
		assert.match(homeBody, /1[,.]?200/)
		assert.match(homeBody, /USD/)
	})

	it('shows sign-in link when not authenticated', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Sign in with GitHub/)
		assert.match(body, /href="\/auth\/github"/)
	})

	it('renders advice form section on the homepage', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.match(body, /Get Advice/)
		assert.match(body, /name="cashAmount"/)
		assert.match(body, /action="\/advice"/)
	})

	it('homepage has a link to the guidelines page', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.match(body, /href="\/guidelines"/)
		assert.match(body, /Investment Guidelines/)
	})

	it('homepage has a link to the ETF catalog', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.match(body, /href="\/catalog"/)
		assert.match(body, /ETF Catalog/)
	})
})
