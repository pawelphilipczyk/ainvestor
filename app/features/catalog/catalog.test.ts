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

async function signInAs(login: string, params: { isAdmin?: boolean } = {}) {
	const session = await sessionStorage.read(null)
	session.set('login', login)
	session.set('token', 'test-token')
	session.set('gistId', 'gist-1')
	session.set('isAdmin', params.isAdmin ?? true)
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

	it('GET /catalog/catalog.json returns sorted JSON with public cache header', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'row-json-b',
						fund_name: 'B Fund',
						ticker: 'BBB',
						assets: 'akcje',
					},
					{
						id: 'row-json-a',
						fund_name: 'A Fund',
						ticker: 'AAA',
						assets: 'akcje',
					},
				],
				count: 2,
			}),
		)
		const response = await testSessionFetch(
			'http://localhost/catalog/catalog.json',
		)
		assert.equal(response.status, 200)
		assert.equal(
			(response.headers.get('content-type') ?? '').includes('application/json'),
			true,
		)
		assert.match(response.headers.get('cache-control') ?? '', /public/)
		const rows = JSON.parse(await response.text()) as { ticker: string }[]
		assert.ok(Array.isArray(rows))
		assert.deepEqual(
			rows.map((row) => row.ticker),
			['AAA', 'BBB'],
		)
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

	it('GET /admin/etf-import shows import form for bank API JSON', async () => {
		seedSharedCatalog(
			JSON.stringify({
				data: [{ fund_name: 'Existing Fund', ticker: 'OLD', assets: 'akcje' }],
				count: 1,
			}),
		)
		const cookie = await signInAs('catalog-admin')
		const response = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Admin/)
		assert.match(body, /Import ETF Data/)
		assert.match(body, /Use this only when/)
		assert.match(
			body,
			/<form\b[^>]*\bmethod="post"[^>]*\baction="\/catalog\/import"[^>]*\benctype="multipart\/form-data"[^>]*>/,
		)
		assert.match(body, /name="bankApiJson"/)
		assert.match(body, /name="bankApiHar"/)
		assert.match(
			body,
			/<form\b(?=[^>]*\bmethod="post")(?=[^>]*\baction="\/catalog\/import")[^>]*>/,
		)
		assert.doesNotMatch(body, /data-frame-submit="catalog-list"/)
		assert.doesNotMatch(body, /data-error-id="catalog-import-error"/)
		assert.doesNotMatch(body, /data-reset-form/)
		assert.match(
			body,
			/<form\b(?=[^>]*\bmethod="post")(?=[^>]*\baction="\/catalog\/import")[^>]*>[\s\S]*?submit-button-busy-overlay[\s\S]*?<\/form>/,
		)
	})

	it('GET /admin/etf-import returns 404 for signed-in non-admin user', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: 'regular-user' })
		const cookie = await signInAs('regular-user', { isAdmin: false })
		const response = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
		const body = await response.text()

		assert.equal(response.status, 404)
		assert.doesNotMatch(body, /Import ETF Data/)
		assert.doesNotMatch(body, /name="bankApiJson"/)
	})

	it('GET /admin/etf-import allows session isAdmin when login is not catalog owner', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: 'catalog-admin' })
		const cookie = await signInAs('regular-user', { isAdmin: true })
		const response = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Import ETF Data/)
	})

	it('GET /catalog does not show the ETF data import form', async () => {
		const cookie = await signInAs('catalog-admin')
		const response = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.doesNotMatch(body, /action="\/catalog\/import"/)
		assert.doesNotMatch(body, /name="bankApiJson"/)
		assert.doesNotMatch(body, /Paste bank API JSON/)
	})

	it('POST /catalog/import returns JSON for Accept: application/json on success without consuming flash', async () => {
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

		const importResponse = await testSessionFetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: (() => {
					const formData = new FormData()
					formData.set('bankApiJson', bankJson)
					return formData
				})(),
				headers: {
					Cookie: cookie,
					Accept: 'application/json',
				},
			}),
		)

		assert.equal(importResponse.status, 200)
		const payload = (await importResponse.json()) as {
			ok?: unknown
			bannerText?: unknown
			bannerTone?: unknown
		}
		assert.equal(payload.ok, true)
		assert.equal(typeof payload.bannerText, 'string')
		assert.match(payload.bannerText as string, /Merged 1 row/)
		assert.equal(payload.bannerTone, 'success')

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
		const catalogBody = await catalogResponse.text()
		assert.doesNotMatch(catalogBody, /aria-label="Success"/)
	})

	it('POST /catalog/import returns JSON error for Accept: application/json when JSON is invalid', async () => {
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
				headers: {
					Cookie: cookie,
					Accept: 'application/json',
				},
			}),
		)

		assert.equal(importResponse.status, 422)
		const payload = (await importResponse.json()) as { error?: unknown }
		assert.equal(typeof payload.error, 'string')
		assert.match(payload.error as string, /not valid JSON/)
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

		assert.match(body, /No catalog imported yet/)
		assert.match(body, /The shared catalog gist is empty/)
		assert.doesNotMatch(body, /Open Admin ETF import/)
	})

	it('GET /catalog shows Admin import link for gist owner when catalog is empty', async () => {
		setSharedCatalogForTests({ entries: [], ownerLogin: 'catalog-admin' })
		const cookie = await signInAs('catalog-admin')
		const response = await testSessionFetch('http://localhost/catalog', {
			headers: { Cookie: cookie },
		})
		const body = await response.text()

		assert.match(body, /No catalog imported yet/)
		assert.match(body, /href="\/admin\/etf-import"/)
		assert.match(body, /Open Admin ETF import/)
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
		assert.equal(importResponse.headers.get('location'), '/admin/etf-import')

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
		assert.equal(importResponse.headers.get('location'), '/admin/etf-import')

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

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
		const body = await catalogResponse.text()

		assert.match(body, /Catalog saved/)
		assert.match(body, /Merged 1 row/)
		assert.match(body, /aria-label="Success"/)
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
		assert.equal(importResponse.headers.get('location'), '/admin/etf-import')

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
		const body = await catalogResponse.text()

		assert.match(body, /<section[^>]*aria-label="Error"/)
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

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
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

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
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

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
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

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
		const body = await catalogResponse.text()

		assert.match(body, /Catalog saved/)
		assert.match(body, /Skipped rows:/)
		assert.match(body, /Row 2/)
		assert.match(body, /Missing ticker/)
		assert.match(body, /aria-label="Info"/)
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

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
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

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
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

		const catalogResponse = await testSessionFetch(
			'http://localhost/admin/etf-import',
			{
				headers: { Cookie: cookie },
			},
		)
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
		addForm.set('portfolioOperation', 'buy')
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
		assert.match(body, /name="risk"/)
		assert.match(body, /1 ETF in catalog/)
	})

	it('catalog filter form uses Frame submit + fragment action for list updates', async () => {
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
			/<form\b[^>]*\bmethod="get"[^>]*\bdata-frame-submit="catalog-list"/,
		)
		assert.match(
			body,
			/<form\b[^>]*\bdata-frame-get-fragment-action="\/catalog\/fragments\/list"/,
		)
		assert.match(
			body,
			/<form\b(?=[^>]*\bmethod="get")(?=[^>]*\bdata-frame-submit="catalog-list")[^>]*>[\s\S]*?submit-button-busy-overlay[\s\S]*?<\/form>/,
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

	it('catalog risk filter narrows results by risk band', async () => {
		const bankJson = JSON.stringify({
			data: [
				{
					fund_name: 'Low Risk Fund',
					ticker: 'LOW',
					assets: 'akcje',
					risk_kid: 2,
				},
				{
					fund_name: 'Medium Risk Fund',
					ticker: 'MID',
					assets: 'akcje',
					risk_kid: 4,
				},
				{
					fund_name: 'High Risk Fund',
					ticker: 'HI',
					assets: 'akcje',
					risk_kid: 6,
				},
			],
			count: 3,
			total_count: 3,
		})
		seedSharedCatalog(bankJson)

		const response = await testSessionFetch(
			'http://localhost/catalog?risk=medium',
		)
		const body = await response.text()

		assert.match(body, /MID/)
		assert.doesNotMatch(body, />LOW</)
		assert.doesNotMatch(body, />HI</)
		assert.match(body, />medium</)
		assert.match(body, /Showing 1 of 3 ETFs/)
	})

	it('catalog risk column renders chips with band markers', async () => {
		const bankJson = JSON.stringify({
			data: [
				{
					fund_name: 'Low Risk Fund',
					ticker: 'LOW',
					assets: 'akcje',
					risk_kid: 2,
				},
				{
					fund_name: 'Medium Risk Fund',
					ticker: 'MID',
					assets: 'akcje',
					risk_kid: 4,
				},
				{
					fund_name: 'High Risk Fund',
					ticker: 'HI',
					assets: 'akcje',
					risk_kid: 6,
				},
			],
			count: 3,
			total_count: 3,
		})
		seedSharedCatalog(bankJson)

		const response = await testSessionFetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /data-risk-band="low"/)
		assert.match(body, /data-risk-band="medium"/)
		assert.match(body, /data-risk-band="high"/)
		assert.match(body, /bg-sky-/)
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
