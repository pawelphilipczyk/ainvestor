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

	it('adds to existing ETF value when adding same name instead of replacing', async () => {
		const form1 = new FormData()
		form1.set('etfName', 'VTI')
		form1.set('value', '1200')
		form1.set('currency', 'USD')

		await router.fetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form1 }),
		)

		const form2 = new FormData()
		form2.set('etfName', 'VTI')
		form2.set('value', '500')
		form2.set('currency', 'USD')

		await router.fetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form2 }),
		)

		const homeResponse = await router.fetch('http://localhost/')
		const homeBody = await homeResponse.text()

		assert.match(homeBody, /VTI/)
		assert.match(homeBody, /1[,.]?700/)
		assert.match(homeBody, /USD/)
		const deleteForms = homeBody.match(/action="\/etfs\/[a-f0-9-]+"/g)
		assert.equal(
			deleteForms?.length ?? 0,
			1,
			'should have exactly one ETF entry',
		)
	})

	it('portfolio page no longer uses legacy etf-card data-island hooks', async () => {
		const form = new FormData()
		form.set('etfName', 'VTI')
		form.set('value', '1000')
		form.set('currency', 'USD')

		await router.fetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)

		const listResponse = await router.fetch('http://localhost/')
		const listBody = await listResponse.text()
		assert.doesNotMatch(listBody, /data-island="features\/portfolio\/etf-card"/)
	})

	it('serves etf-card component entry and hides old island endpoint', async () => {
		const componentResponse = await router.fetch(
			'http://localhost/features/portfolio/etf-card.component.js',
		)
		assert.equal(componentResponse.status, 200)
		assert.match(
			componentResponse.headers.get('content-type') ?? '',
			/text\/javascript/,
		)
		const legacyResponse = await router.fetch(
			'http://localhost/features/portfolio/etf-card.island.js',
		)
		assert.equal(legacyResponse.status, 404)
	})

	it('ETF card component entry uses remix component + interaction APIs', async () => {
		const componentResponse = await router.fetch(
			'http://localhost/features/portfolio/etf-card.component.js',
		)
		const componentBody = await componentResponse.text()
		assert.match(componentBody, /clientEntry/)
		assert.match(componentBody, /from 'remix\/component'/)
		assert.match(componentBody, /from 'remix\/interaction'/)
		assert.match(componentBody, /ownerDocument/)
		assert.match(componentBody, /on\(doc,/)
	})

	it('uses explicit readable colors for the sell confirmation cancel button', async () => {
		const form = new FormData()
		form.set('etfName', 'VTI')
		form.set('value', '1000')
		form.set('currency', 'USD')

		await router.fetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)

		const response = await router.fetch('http://localhost/')
		const body = await response.text()

		assert.match(
			body,
			/<button\s+type="submit"\s+class="[^"]*bg-background[^"]*text-card-foreground[^"]*"[\s\S]*?>\s*Cancel\s*<\/button>/,
		)
	})

	it('DELETE /etfs/:id removes the ETF via method override', async () => {
		const form = new FormData()
		form.set('etfName', 'VTI')
		form.set('value', '1000')
		form.set('currency', 'USD')

		await router.fetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)

		const listResponse = await router.fetch('http://localhost/')
		const listBody = await listResponse.text()
		const idMatch = listBody.match(/action="\/etfs\/([a-f0-9-]+)"/)
		assert.ok(idMatch, 'delete form action should be present')
		const id = idMatch[1]

		const deleteForm = new FormData()
		deleteForm.set('_method', 'DELETE')
		const deleteResponse = await router.fetch(
			new Request(`http://localhost/etfs/${id}`, {
				method: 'POST',
				body: deleteForm,
			}),
		)

		assert.equal(deleteResponse.status, 302)

		const afterBody = await (await router.fetch('http://localhost/')).text()
		assert.match(afterBody, /No ETFs added yet/)
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
