import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { sessionCookie, sessionStorage } from '../../lib/session.ts'
import {
	resetTestSessionCookieJar,
	testSessionFetch,
} from '../../lib/test-session-fetch.ts'
import { resetEtfEntries } from '../portfolio/index.ts'
import {
	parseBankJsonToCatalog,
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from './lib.ts'

afterEach(() => {
	resetEtfEntries()
	resetSharedCatalogForTests()
	resetTestSessionCookieJar()
})

function seedSharedCatalog(bankJson: string, ownerLogin = 'catalog-admin') {
	setSharedCatalogForTests({
		entries: parseBankJsonToCatalog(JSON.parse(bankJson)),
		ownerLogin,
	})
}

async function signInAs(login: string) {
	const session = await sessionStorage.read(null)
	session.set('login', login)
	session.set('token', 'test-token')
	session.set('gistId', 'gist-1')
	session.set('sharedCatalogAdmin', true)
	process.env.APPROVED_GITHUB_LOGINS = login
	const value = await sessionStorage.save(session)
	if (value == null) throw new Error('expected session save value')
	const cookieHeader = await sessionCookie.serialize(value)
	return cookieHeader.split(';')[0]
}

describe('ETF Catalog page', () => {
	it('GET /catalog returns 200 with page title', async () => {
		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /ETF Catalog/)
	})

	it('GET /catalog shows import form for bank API JSON', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [{ fund_name: 'Existing Fund', ticker: 'OLD', assets: 'akcje' }],
				count: 1,
			}),
		)
		const cookie = await signInAs('catalog-admin')
		const response = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await response.text()

		assert.match(body, /data-fetch-submit/)
		assert.match(body, /name="bankApiJson"/)
		assert.match(body, /action="\/catalog\/import"/)
	})

	it('GET /catalog hides import section for users without import permission', async () => {
		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.doesNotMatch(body, /action="\/catalog\/import"/)
		assert.doesNotMatch(body, /name="bankApiJson"/)
	})

	it('GET /catalog shows empty state hint when no catalog imported', async () => {
		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /No ETFs match your search/)
	})

	it('GET /catalog renders theme toggle button hook without escaped HTML text', async () => {
		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /<button[^>]*data-theme-toggle/)
		assert.doesNotMatch(body, /&lt;button/)
	})

	it('GET /catalog has a link back to the portfolio', async () => {
		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /href="\/portfolio"/)
		assert.match(body, /Portfolio/)
	})

	it('POST /catalog/import rejects non-owner sessions', async () => {
		const bankJson = JSON.stringify({
			data: [
				{
					isin: 'IE00BGV5VR99',
					fund_name: 'Xtrackers Future Mobility UCITS ETF 1C',
					ticker: 'XMOV GR',
					description: 'ETF tracks Nasdaq Future Mobility.',
					assets: 'akcje',
					sector: 'technologia',
				},
			],
			count: 1,
			total_count: 1,
		})

		const formData = new FormData()
		formData.set('bankApiJson', bankJson)
		seedSharedCatalog(
			JSON.stringify({
				data: [{ fund_name: 'Existing Fund', ticker: 'OLD', assets: 'akcje' }],
				count: 1,
			}),
		)

		const importResponse = await testSessionFetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: formData,
			}),
		)

		assert.equal(importResponse.status, 302)
		assert.equal(importResponse.headers.get('location'), '/catalog')

		resetTestSessionCookieJar()
		const catalogResponse = await testSessionFetch('http://localhost/catalog')
		const body = await catalogResponse.text()

		assert.match(body, /Existing Fund/)
		assert.doesNotMatch(body, /Xtrackers Future Mobility/)
	})

	it('POST /catalog/import merges into shared catalog for gist owner', async () => {
		const bankJson = JSON.stringify({
			data: [
				{
					isin: 'IE00BGV5VR99',
					fund_name: 'Xtrackers Future Mobility UCITS ETF 1C',
					ticker: 'XMOV GR',
					description: 'ETF tracks Nasdaq Future Mobility.',
					assets: 'akcje',
					sector: 'technologia',
				},
			],
			count: 1,
			total_count: 1,
		})
		seedSharedCatalog(
			JSON.stringify({
				data: [{ fund_name: 'Existing Fund', ticker: 'OLD', assets: 'akcje' }],
				count: 1,
			}),
		)
		const cookie = await signInAs('catalog-admin')

		const importResponse = await testSessionFetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: (() => {
					const formData = new FormData()
					formData.set('bankApiJson', bankJson)
					return formData
				})(),
				headers: { Cookie: cookie },
			}),
		)

		assert.equal(importResponse.status, 302)
		assert.equal(importResponse.headers.get('location'), '/catalog')

		const catalogResponse = await testSessionFetch('http://localhost/catalog')
		const body = await catalogResponse.text()

		assert.match(body, /Existing Fund/)
		assert.match(body, /OLD/)
		assert.match(body, /XMOV GR/)
		assert.match(body, /Xtrackers Future Mobility/)
	})

	it('catalog shows Your Holdings section when a holding matches a catalog ticker', async () => {
		const bankJson = JSON.stringify({
			data: [
				{
					fund_name: 'Vanguard Total',
					ticker: 'VTI',
					description: 'US broad market',
					assets: 'akcje',
				},
			],
			count: 1,
			total_count: 1,
		})
		seedSharedCatalog(bankJson)

		const addForm = new FormData()
		addForm.set('instrumentTicker', 'VTI')
		addForm.set('value', '5000')
		addForm.set('currency', 'USD')
		await testSessionFetch(
			new Request('http://localhost/etfs', { method: 'POST', body: addForm }),
		)

		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /Your Holdings/)
		assert.match(body, /5[,.]?000/)
	})

	it('catalog uses ScrollableTable (frame + min-w-full w-max) for horizontal scroll', async () => {
		const bankJson = JSON.stringify({
			data: [
				{
					fund_name: 'Vanguard Total',
					ticker: 'VTI',
					assets: 'akcje',
				},
			],
			count: 1,
			total_count: 1,
		})
		seedSharedCatalog(bankJson)

		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(
			body,
			/<main\b[^>]*\bclass="[^"]*\bmin-w-0\b[^"]*"/,
			'main needs min-w-0 so the page column can shrink below table intrinsic width',
		)
		assert.match(
			body,
			/<div\b(?=[^>]*\bdata-scrollable-table-frame\b)(?=[^>]*\bclass="(?=[^"]*\bmin-w-0\b)(?=[^"]*\boverflow-x-auto\b)[^"]*")[^>]*>/,
			'ScrollableTable outer div needs min-w-0 and overflow-x-auto on class (any order)',
		)
		assert.match(
			body,
			/<table\b[^>]*\bclass="(?=[^"]*\bmin-w-full\b)(?=[^"]*\bw-max\b)(?=[^"]*\btable-auto\b)[^"]*"/,
			'catalog <table> needs min-w-full, w-max, and table-auto (any order) for horizontal scroll',
		)
	})

	it('catalog page shows type filter and search form after import', async () => {
		const bankJson = JSON.stringify({
			data: [
				{
					fund_name: 'Vanguard Total',
					ticker: 'VTI',
					assets: 'akcje',
				},
			],
			count: 1,
			total_count: 1,
		})
		seedSharedCatalog(bankJson)

		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /name="q"/)
		assert.match(body, /name="type"/)
		assert.match(body, /1 ETF in catalog/)
	})

	it('catalog filter form opts into native navigation loading for SubmitButton spinner', async () => {
		const bankJson = JSON.stringify({
			data: [
				{
					fund_name: 'Vanguard Total',
					ticker: 'VTI',
					assets: 'akcje',
				},
			],
			count: 1,
			total_count: 1,
		})
		seedSharedCatalog(bankJson)

		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(
			body,
			/<form\b[^>]*\bmethod="get"[^>]*\bdata-navigation-loading\b/,
		)
		assert.match(
			body,
			/<form\b(?=[^>]*\bmethod="get")(?=[^>]*\bdata-navigation-loading\b)[^>]*>[\s\S]*?submit-button-busy-overlay[\s\S]*?<\/form>/,
		)
	})

	it('catalog type filter narrows results', async () => {
		const bankJson = JSON.stringify({
			data: [
				{ fund_name: 'Vanguard Total', ticker: 'VTI', assets: 'akcje' },
				{ fund_name: 'Vanguard Bond', ticker: 'BND', assets: 'obligacje' },
			],
			count: 2,
			total_count: 2,
		})
		seedSharedCatalog(bankJson)

		const response = await testSessionFetch(
			'http://localhost/catalog?type=bond',
		)
		const body = await response.text()

		assert.match(body, /BND/)
		assert.doesNotMatch(body, /VTI/)
		assert.match(body, /Showing 1 of 2 ETFs/)
	})

	it('catalog text search narrows results', async () => {
		const bankJson = JSON.stringify({
			data: [
				{
					fund_name: 'Vanguard Total',
					ticker: 'VTI',
					description: 'US market',
					assets: 'akcje',
				},
				{
					fund_name: 'Vanguard Bond',
					ticker: 'BND',
					description: 'US bonds',
					assets: 'obligacje',
				},
			],
			count: 2,
			total_count: 2,
		})
		seedSharedCatalog(bankJson)

		const response = await testSessionFetch('http://localhost/catalog?q=bond')
		const body = await response.text()

		assert.match(body, /BND/)
		assert.doesNotMatch(body, /VTI/)
	})
})
