import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { testSessionFetch } from '../../lib/test-session-fetch.ts'
import { resetGuestCatalog } from '../catalog/index.ts'
import { resetEtfEntries } from './index.ts'

afterEach(() => {
	resetEtfEntries()
	resetGuestCatalog()
})

/** Seeds guest catalog with tickers used in manual-add portfolio tests. */
async function seedGuestCatalog() {
	const bankJson = JSON.stringify({
		data: [
			{ fund_name: 'VTI', ticker: 'VTI', assets: 'akcje' },
			{ fund_name: 'IBTA LN ETF', ticker: 'IBTA', assets: 'akcje' },
			{ fund_name: 'IQQH GR ETF', ticker: 'IQQH', assets: 'akcje' },
		],
		count: 3,
	})
	await testSessionFetch(
		new Request('http://localhost/catalog/import', {
			method: 'POST',
			body: bankJson,
			headers: { 'Content-Type': 'application/json' },
		}),
	)
}

describe('Health endpoint', () => {
	it('returns ok', async () => {
		const response = await testSessionFetch('http://localhost/health')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.equal(body, 'ok')
	})
})

describe('Intro page', () => {
	it('GET / lists the four main sections as card links', async () => {
		const response = await testSessionFetch('http://localhost/')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /href="\/portfolio"/)
		assert.match(body, /href="\/advice"/)
		assert.match(body, /href="\/catalog"/)
		assert.match(body, /href="\/guidelines"/)
		assert.match(body, /Portfolio/)
		assert.match(body, /Get Advice/)
		assert.match(body, /ETF Catalog/)
		assert.match(body, /Investment Guidelines/)
	})
})

describe('Portfolio page', () => {
	it('GET /portfolio sets Cache-Control: no-store so browsers always fetch a fresh ETF list', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')

		assert.equal(response.headers.get('cache-control'), 'no-store')
	})

	it('renders the portfolio page and ETF form', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(
			body,
			/<body[^>]*\boverflow-x-hidden\b/,
			'body should clip horizontal overflow so narrow viewports do not scroll sideways',
		)
		assert.match(body, /<h1[^>]*>\s*Portfolio\s*<\/h1>/)
		assert.match(body, /<form[^>]*method="post"[^>]*action="\/etfs"/)
		assert.match(body, /Import from CSV/)
		assert.match(body, /action="\/etfs\/import"/)
		assert.match(body, /Add one ETF manually/)
		assert.match(body, /name="portfolioCsvPaste"/)
	})

	it('shows Preview chip in top bar when FLY_APP_NAME is ainvestor-preview', async () => {
		const previousFlyAppName = process.env.FLY_APP_NAME
		try {
			process.env.FLY_APP_NAME = 'ainvestor-preview'
			const response = await testSessionFetch('http://localhost/portfolio')
			const body = await response.text()

			assert.equal(response.status, 200)
			assert.match(body, /Preview/)
			assert.match(body, /role="status"/)
		} finally {
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('form has instrument, value, currency, and quantity fields', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()

		assert.match(body, /name="instrumentTicker"/)
		assert.match(body, /name="value"/)
		assert.match(body, /name="currency"/)
		assert.match(body, /name="quantity"/)
	})

	it('form defaults currency to PLN (first option)', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()

		// PLN is first option, so it is the default when none selected
		assert.match(body, /<select[^>]*>[\s\S]*?<option value="PLN">PLN<\/option>/)
	})

	it('adds ETF with PLN currency', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('value', '1000')
		form.set('currency', 'PLN')

		const postResponse = await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)
		assert.equal(postResponse.status, 302)

		const fragmentRes = await testSessionFetch(
			'http://localhost/fragments/portfolio-list',
		)
		assert.equal(fragmentRes.status, 200)
		const fragmentBody = await fragmentRes.text()
		assert.match(fragmentBody, /VTI/)
		assert.match(fragmentBody, /PLN/)
	})

	it('value field uses money-style decimal input', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()

		const valueInput = body.match(/<input\b[^>]*\bid="value"[^>]*>/)
		assert.ok(valueInput, 'expected #value input')
		assert.match(valueInput[0], /type="text"/)
		assert.match(valueInput[0], /inputmode="decimal"/)
	})

	it('adds ETF when optional quantity is left empty', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('value', '1000')
		form.set('currency', 'PLN')
		form.set('quantity', '')

		const postResponse = await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)
		assert.equal(postResponse.status, 302)

		const homeResponse = await testSessionFetch('http://localhost/portfolio')
		const homeBody = await homeResponse.text()
		assert.match(homeBody, /VTI/)
		assert.match(homeBody, /PLN/)
	})

	it('adds ETF with optional quantity when provided', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'IBTA')
		form.set('value', '4087.48')
		form.set('currency', 'PLN')
		form.set('quantity', '186')

		const postResponse = await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)
		assert.equal(postResponse.status, 302)

		const homeResponse = await testSessionFetch('http://localhost/portfolio')
		const homeBody = await homeResponse.text()
		assert.match(homeBody, /IBTA LN ETF/)
		assert.match(homeBody, /186 shares/)
	})

	it('adds an ETF on form submit and displays it on the portfolio page', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('value', '1200.50')
		form.set('currency', 'USD')

		const postResponse = await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)

		assert.equal(postResponse.status, 302)
		assert.equal(postResponse.headers.get('location'), '/portfolio')

		const homeResponse = await testSessionFetch('http://localhost/portfolio')
		const homeBody = await homeResponse.text()

		assert.match(homeBody, /VTI/)
		assert.match(homeBody, /1[,.]?200/)
		assert.match(homeBody, /USD/)
	})

	it('imports portfolio from pasted CSV text with Polish headers', async () => {
		const csv = `Papier;Giełda;Liczba dostępna;Wartość;Waluta
IBTA LN ETF;GBR-LSE;186;4087.48;PLN`
		const form = new FormData()
		form.set('portfolioCsvPaste', csv)

		const importResponse = await testSessionFetch(
			new Request('http://localhost/etfs/import', {
				method: 'POST',
				body: form,
			}),
		)
		assert.equal(importResponse.status, 302)

		const homeResponse = await testSessionFetch('http://localhost/portfolio')
		const homeBody = await homeResponse.text()
		assert.match(homeBody, /IBTA LN ETF/)
		assert.match(homeBody, /4[,.]?087/)
		assert.match(homeBody, /186 shares/)
		assert.match(homeBody, /GBR-LSE/)
	})

	it('imports portfolio from CSV with Polish headers including exchange and quantity', async () => {
		const csv = `Papier;Giełda;Liczba dostępna;Wartość;Waluta
IBTA LN ETF;GBR-LSE;186;4087.48;PLN
IQQH GR ETF;DEU-XETRA;81;3217.14;PLN`
		const form = new FormData()
		form.set(
			'portfolioCsv',
			new Blob([csv], { type: 'text/csv' }),
			'portfolio.csv',
		)

		const importResponse = await testSessionFetch(
			new Request('http://localhost/etfs/import', {
				method: 'POST',
				body: form,
			}),
		)
		assert.equal(importResponse.status, 302)

		const homeResponse = await testSessionFetch('http://localhost/portfolio')
		const homeBody = await homeResponse.text()
		assert.match(homeBody, /IBTA LN ETF/)
		assert.match(homeBody, /IQQH GR ETF/)
		assert.match(homeBody, /4[,.]?087/)
		assert.match(homeBody, /3[,.]?217/)
		assert.match(homeBody, /186 shares/)
		assert.match(homeBody, /GBR-LSE/)
		assert.match(homeBody, /81 shares/)
		assert.match(homeBody, /DEU-XETRA/)
	})

	it('adds to existing ETF value when adding same name instead of replacing', async () => {
		await seedGuestCatalog()
		const form1 = new FormData()
		form1.set('instrumentTicker', 'VTI')
		form1.set('value', '1200')
		form1.set('currency', 'USD')

		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form1 }),
		)

		const form2 = new FormData()
		form2.set('instrumentTicker', 'VTI')
		form2.set('value', '500')
		form2.set('currency', 'USD')

		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form2 }),
		)

		const homeResponse = await testSessionFetch('http://localhost/portfolio')
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
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('value', '1000')
		form.set('currency', 'USD')

		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)

		const listResponse = await testSessionFetch('http://localhost/portfolio')
		const listBody = await listResponse.text()
		assert.doesNotMatch(listBody, /data-island="features\/portfolio\/etf-card"/)
	})

	it('serves fetch-submit component entry for form enhancement', async () => {
		const componentScriptResponse = await testSessionFetch(
			'http://localhost/components/fetch-submit.component.js',
		)
		assert.equal(componentScriptResponse.status, 200)
		assert.match(
			componentScriptResponse.headers.get('content-type') ?? '',
			/text\/javascript/,
		)
	})

	it('serves etf-card component entry and hides old island endpoint', async () => {
		const componentResponse = await testSessionFetch(
			'http://localhost/features/portfolio/etf-card.component.js',
		)
		assert.equal(componentResponse.status, 200)
		assert.match(
			componentResponse.headers.get('content-type') ?? '',
			/text\/javascript/,
		)
		const legacyResponse = await testSessionFetch(
			'http://localhost/features/portfolio/etf-card.island.js',
		)
		assert.equal(legacyResponse.status, 404)
	})

	it('ETF card component entry uses remix component + interaction APIs', async () => {
		const componentResponse = await testSessionFetch(
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
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('value', '1000')
		form.set('currency', 'USD')

		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)

		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()

		assert.match(
			body,
			/<button\s+type="submit"\s+class="[^"]*bg-background[^"]*text-card-foreground[^"]*"[\s\S]*?>\s*Cancel\s*<\/button>/,
		)
	})

	it('DELETE /etfs/:id removes the ETF via method override', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('value', '1000')
		form.set('currency', 'USD')

		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)

		const listResponse = await testSessionFetch('http://localhost/portfolio')
		const listBody = await listResponse.text()
		const idMatch = listBody.match(/action="\/etfs\/([a-f0-9-]+)"/)
		assert.ok(idMatch, 'delete form action should be present')
		const id = idMatch[1]

		const deleteForm = new FormData()
		deleteForm.set('_method', 'DELETE')
		const deleteResponse = await testSessionFetch(
			new Request(`http://localhost/etfs/${id}`, {
				method: 'POST',
				body: deleteForm,
			}),
		)

		assert.equal(deleteResponse.status, 302)

		const afterBody = await (
			await testSessionFetch('http://localhost/portfolio')
		).text()
		assert.match(afterBody, /No ETFs added yet/)
	})

	it('shows validation error when adding ETF with invalid data (full-page)', async () => {
		const form = new FormData()
		form.set('instrumentTicker', '')
		form.set('value', '-1')
		form.set('currency', 'PLN')
		const postResponse = await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)
		assert.equal(postResponse.status, 302)
		const location = postResponse.headers.get('Location')
		const cookie = postResponse.headers.get('Set-Cookie')
		const homeResponse = await testSessionFetch(
			location
				? new URL(location, 'http://localhost/').href
				: 'http://localhost/portfolio',
			{ headers: cookie ? { Cookie: cookie.split(';')[0] } : undefined },
		)
		const body = await homeResponse.text()
		assert.match(
			body,
			/Please select a fund from your catalog and enter a valid value/,
		)
	})

	it('returns 422 JSON when fetch sends Accept: application/json and validation fails', async () => {
		const form = new FormData()
		form.set('instrumentTicker', '')
		form.set('value', '-1')
		form.set('currency', 'PLN')
		const jsonErrorResponse = await testSessionFetch(
			new Request('http://localhost/etfs', {
				method: 'POST',
				body: form,
				headers: { Accept: 'application/json' },
			}),
		)
		assert.equal(jsonErrorResponse.status, 422)
		const data = await jsonErrorResponse.json()
		assert.equal(
			data.error,
			'Please select a fund from your catalog and enter a valid value (number >= 0).',
		)
	})

	it('shows sign-in link when not authenticated', async () => {
		const response = await testSessionFetch('http://localhost/')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Sign in with GitHub/)
		assert.match(body, /href="\/auth\/github"/)
	})

	it('GET /fragments/portfolio-list returns ETF list HTML fragment', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('value', '1000')
		form.set('currency', 'PLN')
		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: form }),
		)
		const fragmentResponse = await testSessionFetch(
			'http://localhost/fragments/portfolio-list',
		)
		const body = await fragmentResponse.text()
		assert.equal(fragmentResponse.status, 200)
		assert.match(body, /VTI/)
		assert.match(body, /PLN/)
	})

	it('Add ETF form has data-fetch-submit for progressive enhancement', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()
		assert.match(body, /data-fetch-submit/)
	})
})
