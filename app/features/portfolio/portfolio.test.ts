import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { testSessionFetch } from '../../lib/test-session-fetch.ts'
import {
	parseBankJsonToCatalog,
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../catalog/lib.ts'
import { resetEtfEntries } from './index.ts'

afterEach(() => {
	resetEtfEntries()
	resetSharedCatalogForTests()
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
	setSharedCatalogForTests({
		entries: parseBankJsonToCatalog(JSON.parse(bankJson)),
		ownerLogin: 'catalog-admin',
	})
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
		const deleteMethodFields = homeBody.match(
			/name="_method"\s+value="DELETE"/g,
		)
		assert.equal(
			deleteMethodFields?.length ?? 0,
			2,
			'sell row POST + dialog confirm each include DELETE override',
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

	it('serves navigation-link-loading component entry', async () => {
		const response = await testSessionFetch(
			'http://localhost/components/navigation-link-loading.component.js',
		)
		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /text\/javascript/)
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

	it('ETF card component entry wires document listeners via handle.signal', async () => {
		const componentResponse = await testSessionFetch(
			'http://localhost/features/portfolio/etf-card.component.js',
		)
		const componentBody = await componentResponse.text()
		assert.match(componentBody, /clientEntry/)
		assert.match(componentBody, /from 'remix\/component'/)
		assert.match(componentBody, /addEventListeners/)
		assert.match(componentBody, /handle\.signal/)
		assert.match(componentBody, /addEventListeners\(doc, handle\.signal/)
		assert.match(
			componentBody,
			/data-enhance-dialog/,
			'sell uses dialog enhancement on native DELETE form submit',
		)
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

	it('POST /etfs/:id updates value and quantity for a holding', async () => {
		await seedGuestCatalog()
		const addForm = new FormData()
		addForm.set('instrumentTicker', 'VTI')
		addForm.set('value', '1000')
		addForm.set('currency', 'USD')
		addForm.set('quantity', '10')

		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: addForm }),
		)

		const listResponse = await testSessionFetch('http://localhost/portfolio')
		const listBody = await listResponse.text()
		const updateMatch = listBody.match(
			/<form[^>]*method="post"[^>]*action="(\/etfs\/[a-f0-9-]+)"/,
		)
		assert.ok(updateMatch, 'update form action should be present')
		const updateUrl = `http://localhost${updateMatch[1]}`

		const updateForm = new FormData()
		updateForm.set('value', '850.25')
		updateForm.set('quantity', '8')
		const updateResponse = await testSessionFetch(
			new Request(updateUrl, { method: 'POST', body: updateForm }),
		)
		assert.equal(updateResponse.status, 302)

		const after = await (
			await testSessionFetch('http://localhost/portfolio')
		).text()
		assert.match(after, /8 shares/)
		assert.match(after, /850/)
	})

	it('POST /etfs/:id clears quantity when quantity field is empty', async () => {
		await seedGuestCatalog()
		const addForm = new FormData()
		addForm.set('instrumentTicker', 'IBTA')
		addForm.set('value', '2000')
		addForm.set('currency', 'PLN')
		addForm.set('quantity', '50')

		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: addForm }),
		)

		const listBody = await (
			await testSessionFetch('http://localhost/portfolio')
		).text()
		const updateMatch = listBody.match(
			/<form[^>]*method="post"[^>]*action="(\/etfs\/[a-f0-9-]+)"/,
		)
		assert.ok(updateMatch)
		const updateUrl = `http://localhost${updateMatch[1]}`

		const updateForm = new FormData()
		updateForm.set('value', '2100')
		updateForm.set('quantity', '')
		await testSessionFetch(
			new Request(updateUrl, { method: 'POST', body: updateForm }),
		)

		const after = await (
			await testSessionFetch('http://localhost/portfolio')
		).text()
		assert.doesNotMatch(after, /50 shares/)
	})

	it('returns 422 JSON when portfolio update validation fails with Accept: application/json', async () => {
		await seedGuestCatalog()
		const addForm = new FormData()
		addForm.set('instrumentTicker', 'VTI')
		addForm.set('value', '100')
		addForm.set('currency', 'USD')

		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: addForm }),
		)

		const listBody = await (
			await testSessionFetch('http://localhost/portfolio')
		).text()
		const updateMatch = listBody.match(
			/<form[^>]*method="post"[^>]*action="(\/etfs\/[a-f0-9-]+)"/,
		)
		assert.ok(updateMatch)
		const updateUrl = `http://localhost${updateMatch[1]}`

		const badForm = new FormData()
		badForm.set('value', '-1')
		const jsonRes = await testSessionFetch(
			new Request(updateUrl, {
				method: 'POST',
				body: badForm,
				headers: { Accept: 'application/json' },
			}),
		)
		assert.equal(jsonRes.status, 422)
		const data = await jsonRes.json()
		assert.match(data.error, /valid value/)
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
		assert.match(body, /data-navigation-loading/)
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
