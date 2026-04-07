import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
	resetTestSessionCookieJar,
	testSessionFetch,
} from '../../lib/test-session-fetch.ts'
import {
	parseBankJsonToCatalog,
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../catalog/lib.ts'
import { resetEtfEntries } from './index.ts'

afterEach(() => {
	resetTestSessionCookieJar()
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

function portfolioBuyForm(fields: {
	instrumentTicker: string
	value: string
	currency: string
}) {
	const form = new FormData()
	form.set('portfolioOperation', 'buy')
	form.set('instrumentTicker', fields.instrumentTicker)
	form.set('value', fields.value)
	form.set('currency', fields.currency)
	return form
}

function portfolioSellForm(fields: {
	instrumentTicker: string
	value: string
	currency: string
}) {
	const form = new FormData()
	form.set('portfolioOperation', 'sell')
	form.set('instrumentTicker', fields.instrumentTicker)
	form.set('value', fields.value)
	form.set('currency', fields.currency)
	return form
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
		assert.match(body, /<form[^>]*method="post"[^>]*action="\/portfolio"/)
		assert.match(body, /Import from CSV/)
		assert.match(body, /action="\/portfolio\/import"/)
		assert.match(body, /Buy or sell/)
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

	it('form has instrument, value, currency, and action fields', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()

		assert.match(body, /name="instrumentTicker"/)
		assert.match(body, /name="value"/)
		assert.match(body, /name="currency"/)
		assert.match(body, /name="portfolioOperation"/)
	})

	it('form defaults currency to PLN (first option)', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()

		// PLN is first option, so it is the default when none selected
		assert.match(body, /<select[^>]*>[\s\S]*?<option value="PLN">PLN<\/option>/)
	})

	it('adds ETF with PLN currency', async () => {
		await seedGuestCatalog()
		const form = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'PLN',
		})

		const postResponse = await testSessionFetch(
			new Request('http://localhost/portfolio', { method: 'POST', body: form }),
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

		const valueInput = body.match(
			/<input\b[^>]*\bid="portfolio-trade-value"[^>]*>/,
		)
		assert.ok(valueInput, 'expected #portfolio-trade-value input')
		assert.match(valueInput[0], /type="text"/)
		assert.match(valueInput[0], /inputmode="decimal"/)
	})

	it('adds ETF for IBTA from catalog', async () => {
		await seedGuestCatalog()
		const form = portfolioBuyForm({
			instrumentTicker: 'IBTA',
			value: '4087.48',
			currency: 'PLN',
		})

		const postResponse = await testSessionFetch(
			new Request('http://localhost/portfolio', { method: 'POST', body: form }),
		)
		assert.equal(postResponse.status, 302)

		const homeResponse = await testSessionFetch('http://localhost/portfolio')
		const homeBody = await homeResponse.text()
		assert.match(homeBody, /IBTA LN ETF/)
		assert.match(homeBody, /4[,.]?087/)
	})

	it('adds an ETF on form submit and displays it on the portfolio page', async () => {
		await seedGuestCatalog()
		const form = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '1200.50',
			currency: 'USD',
		})

		const postResponse = await testSessionFetch(
			new Request('http://localhost/portfolio', { method: 'POST', body: form }),
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
		const csv = `Papier;Giełda;Wartość;Waluta
IBTA LN ETF;GBR-LSE;4087.48;PLN`
		const form = new FormData()
		form.set('portfolioCsvPaste', csv)

		const importResponse = await testSessionFetch(
			new Request('http://localhost/portfolio/import', {
				method: 'POST',
				body: form,
			}),
		)
		assert.equal(importResponse.status, 302)

		const homeResponse = await testSessionFetch('http://localhost/portfolio')
		const homeBody = await homeResponse.text()
		assert.match(homeBody, /IBTA LN ETF/)
		assert.match(homeBody, /4[,.]?087/)
		assert.match(homeBody, /GBR-LSE/)
	})

	it('imports portfolio from CSV with Polish headers including exchange', async () => {
		const csv = `Papier;Giełda;Wartość;Waluta
IBTA LN ETF;GBR-LSE;4087.48;PLN
IQQH GR ETF;DEU-XETRA;3217.14;PLN`
		const form = new FormData()
		form.set(
			'portfolioCsv',
			new Blob([csv], { type: 'text/csv' }),
			'portfolio.csv',
		)

		const importResponse = await testSessionFetch(
			new Request('http://localhost/portfolio/import', {
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
		assert.match(homeBody, /GBR-LSE/)
		assert.match(homeBody, /DEU-XETRA/)
	})

	it('adds to existing ETF value when adding same name instead of replacing', async () => {
		await seedGuestCatalog()
		const form1 = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '1200',
			currency: 'USD',
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: form1,
			}),
		)

		const form2 = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '500',
			currency: 'USD',
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: form2,
			}),
		)

		const homeResponse = await testSessionFetch('http://localhost/portfolio')
		const homeBody = await homeResponse.text()

		assert.match(homeBody, /VTI/)
		assert.match(homeBody, /1[,.]?700/)
		assert.match(homeBody, /USD/)
	})

	it('renders value share bars when all holdings share one currency', async () => {
		await seedGuestCatalog()
		const formVti = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '400',
			currency: 'PLN',
		})
		await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: formVti,
			}),
		)
		const formIbta = portfolioBuyForm({
			instrumentTicker: 'IBTA',
			value: '600',
			currency: 'PLN',
		})
		await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: formIbta,
			}),
		)

		const listResponse = await testSessionFetch('http://localhost/portfolio')
		const listBody = await listResponse.text()

		assert.match(listBody, /aria-label="40% of total holdings value for VTI"/)
		assert.match(
			listBody,
			/aria-label="60% of total holdings value for IBTA LN ETF"/,
		)
	})

	it('portfolio page no longer uses legacy etf-card data-island hooks', async () => {
		await seedGuestCatalog()
		const form = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'USD',
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio', { method: 'POST', body: form }),
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

	it('POST /portfolio sell reduces value for a holding', async () => {
		await seedGuestCatalog()
		const addForm = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'USD',
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: addForm,
			}),
		)

		const sellForm = portfolioSellForm({
			instrumentTicker: 'VTI',
			value: '149.75',
			currency: 'USD',
		})
		const sellResponse = await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: sellForm,
			}),
		)
		assert.equal(sellResponse.status, 302)

		const after = await (
			await testSessionFetch('http://localhost/portfolio')
		).text()
		assert.match(after, /850/)
	})

	it('POST /portfolio sell removes row when value sold matches holding', async () => {
		await seedGuestCatalog()
		const addForm = portfolioBuyForm({
			instrumentTicker: 'IBTA',
			value: '2000',
			currency: 'PLN',
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: addForm,
			}),
		)

		const sellForm = portfolioSellForm({
			instrumentTicker: 'IBTA',
			value: '2000',
			currency: 'PLN',
		})
		await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: sellForm,
			}),
		)

		const after = await (
			await testSessionFetch('http://localhost/portfolio')
		).text()
		assert.match(after, /No ETFs added yet/)
	})

	it('returns 422 HTML list fragment when sell validation fails with Accept: text/html', async () => {
		await seedGuestCatalog()
		const addForm = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '100',
			currency: 'USD',
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: addForm,
			}),
		)

		const badSell = portfolioSellForm({
			instrumentTicker: 'VTI',
			value: '-1',
			currency: 'USD',
		})
		const htmlRes = await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: badSell,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(htmlRes.status, 422)
		const ct = htmlRes.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const fragmentBody = await htmlRes.text()
		assert.match(fragmentBody, /operation \(Buy or Sell\)/)
		assert.match(fragmentBody, /Your Holdings/)
	})

	it('returns 422 JSON when sell validation fails with Accept: application/json', async () => {
		await seedGuestCatalog()
		const addForm = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '100',
			currency: 'USD',
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: addForm,
			}),
		)

		const badSell = portfolioSellForm({
			instrumentTicker: 'VTI',
			value: '-1',
			currency: 'USD',
		})
		const jsonRes = await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: badSell,
				headers: { Accept: 'application/json' },
			}),
		)
		assert.equal(jsonRes.status, 422)
		const data = await jsonRes.json()
		assert.match(data.error, /operation \(Buy or Sell\)/)
	})

	it('DELETE /portfolio/:id still removes a holding when called directly', async () => {
		await seedGuestCatalog()
		const form = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'USD',
		})

		await testSessionFetch(
			new Request('http://localhost/portfolio', { method: 'POST', body: form }),
		)

		const listResponse = await testSessionFetch(
			'http://localhost/fragments/portfolio-list',
		)
		const listBody = await listResponse.text()
		const idMatch = listBody.match(/data-holding-id="([a-f0-9-]+)"/)
		assert.ok(idMatch, 'expected holding id on list row')
		const id = idMatch[1]

		const deleteForm = new FormData()
		deleteForm.set('_method', 'DELETE')
		const deleteResponse = await testSessionFetch(
			new Request(`http://localhost/portfolio/${id}`, {
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
		const form = portfolioBuyForm({
			instrumentTicker: '',
			value: '-1',
			currency: 'PLN',
		})
		const postResponse = await testSessionFetch(
			new Request('http://localhost/portfolio', { method: 'POST', body: form }),
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
		assert.match(body, /operation \(Buy or Sell\)/)
	})

	it('returns 422 JSON when fetch sends Accept: application/json and validation fails', async () => {
		const form = portfolioBuyForm({
			instrumentTicker: '',
			value: '-1',
			currency: 'PLN',
		})
		const jsonErrorResponse = await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: form,
				headers: { Accept: 'application/json' },
			}),
		)
		assert.equal(jsonErrorResponse.status, 422)
		const data = await jsonErrorResponse.json()
		assert.match(
			data.error,
			/Please choose an operation \(Buy or Sell\), select a fund from your catalog/,
		)
	})

	it('returns 422 HTML list fragment when validation fails with Accept: text/html', async () => {
		const form = portfolioBuyForm({
			instrumentTicker: '',
			value: '-1',
			currency: 'PLN',
		})
		const htmlErrorResponse = await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: form,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(htmlErrorResponse.status, 422)
		const ct = htmlErrorResponse.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const body = await htmlErrorResponse.text()
		assert.match(body, /operation \(Buy or Sell\)/)
		assert.match(body, /Your Holdings/)
	})

	it('returns HTML list fragment on successful add when Accept: text/html', async () => {
		await seedGuestCatalog()
		const form = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '900',
			currency: 'USD',
		})
		const htmlOkResponse = await testSessionFetch(
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: form,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(htmlOkResponse.status, 200)
		const ct = htmlOkResponse.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const body = await htmlOkResponse.text()
		assert.match(body, /VTI/)
		assert.match(body, /900/)
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
		const form = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'PLN',
		})
		await testSessionFetch(
			new Request('http://localhost/portfolio', { method: 'POST', body: form }),
		)
		const fragmentResponse = await testSessionFetch(
			'http://localhost/fragments/portfolio-list',
		)
		const body = await fragmentResponse.text()
		assert.equal(fragmentResponse.status, 200)
		assert.match(body, /VTI/)
		assert.match(body, /PLN/)
		assert.match(body, /data-portfolio-trade-focus/)
		assert.match(body, /data-portfolio-operation="buy"/)
		assert.match(body, /data-portfolio-operation="sell"/)
		assert.match(body, /data-instrument-ticker="VTI"/)
	})

	it('forms use data-frame-submit for Frame-based list reload', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()
		assert.match(body, /data-frame-submit="portfolio-list"/)
	})

	it('buy/sell form appears above the holdings frame', async () => {
		await seedGuestCatalog()
		const form = portfolioBuyForm({
			instrumentTicker: 'VTI',
			value: '250',
			currency: 'PLN',
		})
		await testSessionFetch(
			new Request('http://localhost/portfolio', { method: 'POST', body: form }),
		)
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()
		assert.match(body, /PLN/)
		const operationFormIdx = body.indexOf('Buy or sell')
		const frameIdx = body.indexOf('"name":"portfolio-list"')
		assert.ok(
			operationFormIdx !== -1 && frameIdx !== -1 && operationFormIdx < frameIdx,
		)
		assert.match(body, /name="portfolioOperation"/)
	})

	it('portfolio page renders a named Frame for the holdings list', async () => {
		const response = await testSessionFetch('http://localhost/portfolio')
		const body = await response.text()
		assert.match(body, /rmx:f:/)
		assert.match(body, /"name":"portfolio-list"/)
		assert.match(body, /Your Holdings/)
	})
})
