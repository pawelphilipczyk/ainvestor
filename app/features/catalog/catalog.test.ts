import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { sessionCookie, sessionStorage } from '../../lib/session.ts'
import {
	resetTestSessionCookieJar,
	testSessionFetch,
} from '../../lib/test-session-fetch.ts'
import { setAdviceClient } from '../advice/advice-client.ts'
import { resetEtfEntries } from '../portfolio/index.ts'
import {
	parseBankJsonToCatalog,
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from './lib.ts'

const originalApprovedGithubLogins = process.env.APPROVED_GITHUB_LOGINS

afterEach(() => {
	setAdviceClient(null)
	resetEtfEntries()
	resetSharedCatalogForTests()
	resetTestSessionCookieJar()
	if (originalApprovedGithubLogins === undefined) {
		delete process.env.APPROVED_GITHUB_LOGINS
	} else {
		process.env.APPROVED_GITHUB_LOGINS = originalApprovedGithubLogins
	}
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

	it('GET /catalog links ticker column to ETF detail when catalog has entries', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'row-ticker-link-test',
						fund_name: 'Test Fund',
						ticker: 'TST',
						assets: 'akcje',
					},
				],
				count: 1,
			}),
		)
		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /href="\/catalog\/etf\/row-ticker-link-test/)
		assert.doesNotMatch(body, />ETF details</)
	})

	it('GET /catalog/etf/:id renders detail without inline AI text (analysis is on demand)', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'row-detail-test',
						fund_name: 'Test Fund',
						ticker: 'TST',
						assets: 'akcje',
					},
				],
				count: 1,
			}),
		)

		const response = await testSessionFetch(
			'http://localhost/catalog/etf/row-detail-test',
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Test Fund/)
		assert.match(body, /From your catalog/)
		assert.match(body, /AI overview/)
		assert.match(body, /action="\/catalog\/etf\/row-detail-test\/analysis"/)
		assert.match(body, /data-frame-submit="catalog-etf-analysis"/)
		assert.match(body, /\/catalog\/fragments\/etf-analysis\/row-detail-test/)
		assert.match(body, /ETF analysis/)
		assert.doesNotMatch(body, /Educational ETF paragraph/)
		assert.match(body, /Back/)
		assert.match(
			body,
			/<a\b[^>]*\bhref="\/catalog"[^>]*\bdata-catalog-etf-back\b/,
			'Back uses catalog as no-JS fallback; JS prefers history.back()',
		)
		assert.match(body, /catalog-etf-back\.component\.js/)
	})

	it('GET /catalog/fragments/etf-analysis/:id returns empty fragment when signed in', async () => {
		await signInAs('catalog-fragment-test')
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'row-fragment-test',
						fund_name: 'Fragment Fund',
						ticker: 'FRG',
						assets: 'akcje',
					},
				],
				count: 1,
			}),
		)

		const response = await testSessionFetch(
			'http://localhost/catalog/fragments/etf-analysis/row-fragment-test',
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /text\/html/)
		assert.doesNotMatch(body, /Fragment Fund/)
	})

	it('POST /catalog/etf/:id/analysis returns HTML fragment with text when OpenAI succeeds', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'row-detail-test',
						fund_name: 'Test Fund',
						ticker: 'TST',
						assets: 'akcje',
					},
				],
				count: 1,
			}),
		)
		setAdviceClient({
			chat: {
				completions: {
					create: async () => ({
						choices: [{ message: { content: 'Educational ETF paragraph.' } }],
					}),
				},
			},
		})

		const response = await testSessionFetch(
			new Request('http://localhost/catalog/etf/row-detail-test/analysis', {
				method: 'POST',
				headers: {
					Accept: 'text/html',
				},
				body: new FormData(),
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /text\/html/)
		assert.match(body, /Educational ETF paragraph\./)
	})

	it('POST /catalog/etf/:id/analysis returns 403 when session is pending approval', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'pending-analysis-test',
						fund_name: 'Test Fund',
						ticker: 'TST',
						assets: 'akcje',
					},
				],
				count: 1,
			}),
		)
		process.env.APPROVED_GITHUB_LOGINS = 'someone-else'
		const session = await sessionStorage.read(null)
		session.set('login', 'pending-catalog')
		session.set('approvalStatus', 'pending')
		const value = await sessionStorage.save(session)
		if (value == null) throw new Error('expected session save value')
		const cookieHeader = await sessionCookie.serialize(value)
		const cookie = cookieHeader.split(';')[0]

		const response = await testSessionFetch(
			new Request(
				'http://localhost/catalog/etf/pending-analysis-test/analysis',
				{
					method: 'POST',
					headers: {
						Accept: 'text/html',
						Cookie: cookie,
					},
					body: new FormData(),
				},
			),
		)
		assert.equal(response.status, 403)
		const body = await response.text()
		assert.match(body, /approved/)
	})

	it('GET /catalog/etf/:id returns 404 for unknown catalog entry id', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [{ fund_name: 'Test Fund', ticker: 'TST', assets: 'akcje' }],
				count: 1,
			}),
		)

		const response = await testSessionFetch(
			'http://localhost/catalog/etf/does-not-exist',
		)

		assert.equal(response.status, 404)
	})

	it('GET /catalog omits ETF detail links from ticker column for pending-approval session', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [{ fund_name: 'Test Fund', ticker: 'TST', assets: 'akcje' }],
				count: 1,
			}),
		)
		process.env.APPROVED_GITHUB_LOGINS = 'someone-else'
		const session = await sessionStorage.read(null)
		session.set('login', 'pending-catalog')
		session.set('approvalStatus', 'pending')
		const value = await sessionStorage.save(session)
		if (value == null) throw new Error('expected session save value')
		const cookieHeader = await sessionCookie.serialize(value)
		const cookie = cookieHeader.split(';')[0]

		const response = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.doesNotMatch(body, /href="[^"]*\/catalog\/etf\//)
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

		assert.match(
			body,
			/<form\b[^>]*\bmethod="post"[^>]*\baction="\/catalog\/import"[^>]*>/,
		)
		assert.match(body, /name="bankApiJson"/)
		assert.match(
			body,
			/<form\b(?=[^>]*\bmethod="post")(?=[^>]*\baction="\/catalog\/import")(?=[^>]*\bdata-navigation-loading\b)[^>]*>/,
		)
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

	it('POST /catalog/import flashes success line when all rows merge with no skips', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: 'catalog-admin' })
		const cookie = await signInAs('catalog-admin')
		const bankJson = JSON.stringify({
			data: [
				{
					isin: 'IE00BGV5VR99',
					fund_name: 'Xtrackers Future Mobility UCITS ETF 1C',
					ticker: 'XMOV GR',
					assets: 'akcje',
					sector: 'technologia',
				},
			],
			count: 1,
		})

		await testSessionFetch(
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

		const catalogResponse = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await catalogResponse.text()

		assert.match(body, /Catalog saved/)
		assert.match(body, /Merged 1 row/)
	})

	it('POST /catalog/import flashes when JSON is invalid', async () => {
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
					formData.set('bankApiJson', '{ not json')
					return formData
				})(),
				headers: { Cookie: cookie },
			}),
		)

		assert.equal(importResponse.status, 302)
		assert.equal(importResponse.headers.get('location'), '/catalog')

		const catalogResponse = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await catalogResponse.text()

		assert.match(body, /role="alert"/)
		assert.match(body, /not valid JSON/)
	})

	it('POST /catalog/import flashes when paste is empty after trim', async () => {
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
					formData.set('bankApiJson', '   \n  ')
					return formData
				})(),
				headers: { Cookie: cookie },
			}),
		)

		assert.equal(importResponse.status, 302)

		const catalogResponse = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await catalogResponse.text()

		assert.match(body, /Paste is empty/)
	})

	it('POST /catalog/import flashes when JSON parses but no ETF rows are extracted', async () => {
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
					formData.set('bankApiJson', JSON.stringify({ data: [] }))
					return formData
				})(),
				headers: { Cookie: cookie },
			}),
		)

		assert.equal(importResponse.status, 302)

		const catalogResponse = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await catalogResponse.text()

		assert.match(body, /empty "data" array/)
	})

	it('POST /catalog/import flashes per-row details when every row fails', async () => {
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
					formData.set(
						'bankApiJson',
						JSON.stringify({
							data: [
								{ fund_name: 'First bad', ticker: '', assets: 'akcje' },
								{ fund_name: '', ticker: 'SECOND', assets: 'akcje' },
							],
						}),
					)
					return formData
				})(),
				headers: { Cookie: cookie },
			}),
		)

		assert.equal(importResponse.status, 302)

		const catalogResponse = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await catalogResponse.text()

		assert.match(body, /Nothing was saved/)
		assert.match(body, /Skipped rows:/)
		assert.match(body, /Row 1/)
		assert.match(body, /Row 2/)
		assert.match(body, /Missing ticker/)
		assert.match(body, /Missing fund_name/)
	})

	it('POST /catalog/import flashes per-row details when a row is skipped', async () => {
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
					formData.set(
						'bankApiJson',
						JSON.stringify({
							data: [
								{
									fund_name: 'Good',
									ticker: 'NEW',
									assets: 'akcje',
								},
								{ fund_name: 'Bad row', ticker: '', assets: 'akcje' },
							],
						}),
					)
					return formData
				})(),
				headers: { Cookie: cookie },
			}),
		)

		assert.equal(importResponse.status, 302)

		const catalogResponse = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await catalogResponse.text()

		assert.match(body, /Catalog saved/)
		assert.match(body, /Skipped rows:/)
		assert.match(body, /Row 2/)
		assert.match(body, /Missing ticker/)
		assert.match(body, /Good/)
	})

	it('POST /catalog/import flashes when paste duplicates the same catalog line', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [{ fund_name: 'Existing Fund', ticker: 'OLD', assets: 'akcje' }],
				count: 1,
			}),
		)
		const cookie = await signInAs('catalog-admin')
		const duplicateRow = {
			isin: 'IE00BGV5VR99',
			fund_name: 'Xtrackers Future Mobility UCITS ETF 1C',
			ticker: 'XMOV GR',
			assets: 'akcje',
			sector: 'technologia',
		}

		const importResponse = await testSessionFetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: (() => {
					const formData = new FormData()
					formData.set(
						'bankApiJson',
						JSON.stringify({
							data: [duplicateRow, duplicateRow],
						}),
					)
					return formData
				})(),
				headers: { Cookie: cookie },
			}),
		)

		assert.equal(importResponse.status, 302)

		const catalogResponse = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await catalogResponse.text()

		assert.match(body, /Catalog saved/)
		assert.match(body, /Skipped rows:/)
		assert.match(body, /Row 2/)
		assert.match(body, /Same catalog key/)
		assert.match(body, /XMOV GR/)
	})

	it('POST /catalog/import merges refresh of existing row and flashes a note', async () => {
		const existing = {
			isin: 'IE00BGV5VR99',
			fund_name: 'Xtrackers Future Mobility UCITS ETF 1C',
			ticker: 'XMOV GR',
			assets: 'akcje',
			sector: 'technologia',
		}
		seedSharedCatalog(
			JSON.stringify({
				data: [existing],
				count: 1,
			}),
		)
		const cookie = await signInAs('catalog-admin')

		const importResponse = await testSessionFetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: (() => {
					const formData = new FormData()
					formData.set(
						'bankApiJson',
						JSON.stringify({
							data: [existing],
						}),
					)
					return formData
				})(),
				headers: { Cookie: cookie },
			}),
		)

		assert.equal(importResponse.status, 302)

		const catalogResponse = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await catalogResponse.text()

		assert.match(body, /Catalog saved/)
		assert.match(body, /Notes:/)
		assert.match(body, /XMOV GR/)
	})

	it('POST /catalog/import summarizes many refresh notes so flash fits cookie session', async () => {
		const rows = Array.from({ length: 15 }, (_, index) => ({
			isin: `IE${String(index).padStart(10, '0')}`,
			fund_name: `Fund ${index}`,
			ticker: `T${index} LN`,
			assets: 'akcje',
		}))
		seedSharedCatalog(JSON.stringify({ data: rows, count: rows.length }))
		const cookie = await signInAs('catalog-admin')

		await testSessionFetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: (() => {
					const formData = new FormData()
					formData.set('bankApiJson', JSON.stringify({ data: rows }))
					return formData
				})(),
				headers: { Cookie: cookie },
			}),
		)

		const catalogResponse = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await catalogResponse.text()

		assert.match(body, /Catalog saved/)
		assert.match(body, /15 row\(s\) refreshed existing catalog lines/)
		assert.doesNotMatch(body, /Row 12 \(/)
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
			new Request('http://localhost/portfolio', {
				method: 'POST',
				body: addForm,
			}),
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
			/<div\b(?=[^>]*\bdata-scrollable-table-clip\b)(?=[^>]*\bclass="(?=[^"]*\bmin-w-0\b)(?=[^"]*\boverflow-hidden\b)[^"]*")[^>]*>/,
			'ScrollableTable clip div needs min-w-0 and overflow-hidden (contains intrinsic table width)',
		)
		assert.match(
			body,
			/<div\b(?=[^>]*\bdata-scrollable-table-frame\b)(?=[^>]*\bclass="(?=[^"]*\bmin-w-0\b)(?=[^"]*\boverflow-x-auto\b)[^"]*")[^>]*>/,
			'ScrollableTable scroll div needs min-w-0 and overflow-x-auto',
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
