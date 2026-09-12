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

async function seedGuestCatalog() {
	const bankJson = JSON.stringify({
		data: [
			{ fund_name: 'Vanguard Total', ticker: 'VTI', assets: 'akcje' },
			{ fund_name: 'Vanguard Bond', ticker: 'BND', assets: 'obligacje' },
			{
				fund_name: 'VNQ',
				ticker: 'VNQ',
				assets: 'akcje',
				sector: 'nieruchomości',
			},
		],
		count: 3,
	})
	setSharedCatalogForTests({
		entries: parseBankJsonToCatalog(JSON.parse(bankJson)),
		ownerLogin: 'catalog-admin',
	})
}

afterEach(() => {
	resetTestSessionCookieJar()
	resetSharedCatalogForTests()
})

/**
 * All four guidelines forms POST to the single `guidelines.action` route
 * (`/guidelines`), discriminated by a hidden `guidelineIntent` field — see
 * `docs/UI_ARCHITECTURE_GUIDELINES.md` §9. This builds that request.
 */
function guidelineActionRequest(
	fields: Record<string, string>,
	headers?: HeadersInit,
) {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.set(key, value)
	return new Request('http://localhost/guidelines', {
		method: 'POST',
		body: form,
		...(headers ? { headers } : {}),
	})
}

function addInstrument(instrumentTicker: string, targetPct: string) {
	return testSessionFetch(
		guidelineActionRequest({
			guidelineIntent: 'addInstrument',
			instrumentTicker,
			targetPct,
		}),
	)
}

function addAssetClass(assetClassType: string, targetPct: string) {
	return testSessionFetch(
		guidelineActionRequest({
			guidelineIntent: 'addAssetClass',
			assetClassType,
			targetPct,
		}),
	)
}

describe('Guidelines page', () => {
	it('GET /guidelines returns 200 with tabbed add forms', async () => {
		await seedGuestCatalog()
		const response = await testSessionFetch('http://localhost/guidelines')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Investment Guidelines/)
		assert.match(body, /guidelines-list\.component\.js/)
		assert.match(body, /href="\/guidelines"/)
		assert.match(body, /href="\/guidelines\?tab=instrument"/)
		assert.match(body, /action="\/guidelines"/)
		assert.match(body, /name="guidelineIntent"[^>]*value="addAssetClass"/)
		assert.match(body, /name="assetClassType"/)
		assert.match(body, /Specific ETF target/)
		assert.match(body, /Asset class bucket/)

		const instrumentPage = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const instrumentBody = await instrumentPage.text()
		assert.match(instrumentBody, /action="\/guidelines"/)
		assert.match(
			instrumentBody,
			/name="guidelineIntent"[^>]*value="addInstrument"/,
		)
		assert.match(instrumentBody, /name="instrumentTicker"/)

		assert.match(body, /Remaining:\s*<strong[^>]*>100%<\/strong>/)
		assert.match(body, /No guidelines added yet\./)
	})

	it('Target % fields use money-style decimal input (numeric keypad)', async () => {
		await seedGuestCatalog()
		const bucketRes = await testSessionFetch('http://localhost/guidelines')
		const bucketBody = await bucketRes.text()
		const instrumentRes = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const instrumentBody = await instrumentRes.text()

		const instrumentPct = instrumentBody.match(
			/<input\b[^>]*\bid="instrumentTargetPct"[^>]*>/,
		)
		const assetPct = bucketBody.match(
			/<input\b[^>]*\bid="assetTargetPct"[^>]*>/,
		)
		assert.ok(instrumentPct, 'expected #instrumentTargetPct input')
		assert.ok(assetPct, 'expected #assetTargetPct input')
		assert.match(instrumentPct[0], /type="text"/)
		assert.match(instrumentPct[0], /inputmode="decimal"/)
		assert.match(assetPct[0], /type="text"/)
		assert.match(assetPct[0], /inputmode="decimal"/)
	})

	it('addInstrument adds a guideline and redirects', async () => {
		await seedGuestCatalog()
		const response = await addInstrument('VTI', '60')

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines?tab=instrument')
	})

	it('addInstrument rejects duplicate ticker with flash message', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '40')
		const response = await addInstrument('VTI', '30')

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines?tab=instrument')

		const page = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const body = await page.text()
		assert.match(body, /already have a guideline for VTI/)
		assert.match(body, /edit or remove that line/)
		const rows = body.match(/data-guideline-edit-form="[a-f0-9-]+"/g) ?? []
		assert.equal(rows.length, 1)
	})

	it('addInstrument returns 422 JSON for duplicate ticker when Accept is JSON', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '40')
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addInstrument',
					instrumentTicker: ' vti ',
					targetPct: '30',
				},
				{ Accept: 'application/json' },
			),
		)

		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(data.error ?? '', /already have a guideline for VTI/)
	})

	it('addInstrument returns 422 HTML list fragment for duplicate when Accept is text/html', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '40')
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addInstrument',
					instrumentTicker: ' vti ',
					targetPct: '30',
				},
				{ Accept: 'text/html' },
			),
		)

		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /already have a guideline for VTI/)
	})

	it('addAssetClass rejects duplicate asset class with flash message', async () => {
		await seedGuestCatalog()
		await addAssetClass('equity', '40')
		const response = await addAssetClass('equity', '30')

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines')

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /already have a guideline for the equity asset class/)
		assert.match(body, /edit or remove that line/)
		const rows = body.match(/data-guideline-edit-form="[a-f0-9-]+"/g) ?? []
		assert.equal(rows.length, 1)
	})

	it('addAssetClass returns 422 JSON for duplicate asset class when Accept is JSON', async () => {
		await seedGuestCatalog()
		await addAssetClass('equity', '40')
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addAssetClass',
					assetClassType: 'equity',
					targetPct: '30',
				},
				{ Accept: 'application/json' },
			),
		)

		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(
			data.error ?? '',
			/already have a guideline for the equity asset class/,
		)
	})

	it('addAssetClass returns 422 HTML list fragment for duplicate when Accept is text/html', async () => {
		await seedGuestCatalog()
		await addAssetClass('equity', '40')
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addAssetClass',
					assetClassType: 'equity',
					targetPct: '30',
				},
				{ Accept: 'text/html' },
			),
		)

		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /already have a guideline for the equity asset class/)
	})

	it('addInstrument rejects when total target % would exceed 100', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '60')
		const response = await addInstrument('BND', '50')

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines?tab=instrument')

		const page = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const body = await page.text()
		assert.match(body, /cannot add up to more than 100%/)
		assert.match(body, /60/)
		assert.match(body, /50/)
		const rows = body.match(/data-guideline-edit-form="[a-f0-9-]+"/g) ?? []
		assert.equal(
			rows.length,
			1,
			'expected only the first guideline after rejected over-cap add',
		)
	})

	it('addInstrument returns 422 JSON when total would exceed 100 and Accept is JSON', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '60')
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addInstrument',
					instrumentTicker: 'BND',
					targetPct: '50',
				},
				{ Accept: 'application/json' },
			),
		)

		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(data.error ?? '', /cannot add up to more than 100%/)
	})

	it('addInstrument returns 422 HTML list fragment when total would exceed 100 and Accept is text/html', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '60')
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addInstrument',
					instrumentTicker: 'BND',
					targetPct: '50',
				},
				{ Accept: 'text/html' },
			),
		)

		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /cannot add up to more than 100%/)
	})

	it('addAssetClass rejects when total target % would exceed 100', async () => {
		await seedGuestCatalog()
		await addAssetClass('equity', '60')
		const response = await addAssetClass('bond', '50')

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines')

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /cannot add up to more than 100%/)
		assert.match(body, /60/)
		assert.match(body, /50/)
		const rows = body.match(/data-guideline-edit-form="[a-f0-9-]+"/g) ?? []
		assert.equal(
			rows.length,
			1,
			'expected only the first guideline after rejected over-cap add',
		)
	})

	it('addAssetClass returns 422 JSON when total would exceed 100 and Accept is JSON', async () => {
		await seedGuestCatalog()
		await addAssetClass('equity', '60')
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addAssetClass',
					assetClassType: 'bond',
					targetPct: '50',
				},
				{ Accept: 'application/json' },
			),
		)

		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(data.error ?? '', /cannot add up to more than 100%/)
	})

	it('addAssetClass returns 422 HTML list fragment when total would exceed 100 and Accept is text/html', async () => {
		await seedGuestCatalog()
		await addAssetClass('equity', '60')
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addAssetClass',
					assetClassType: 'bond',
					targetPct: '50',
				},
				{ Accept: 'text/html' },
			),
		)

		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /cannot add up to more than 100%/)
	})

	it('addInstrument accepts locale-style target % (comma decimal)', async () => {
		await seedGuestCatalog()
		const postResponse = await addInstrument('VTI', '12,5')

		assert.equal(postResponse.status, 302)
		assert.equal(
			postResponse.headers.get('location'),
			'/guidelines?tab=instrument',
		)

		const page = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const body = await page.text()
		assert.match(body, /12\.5/)
	})

	it('added guideline appears on the guidelines page', async () => {
		await seedGuestCatalog()
		await addInstrument('BND', '30')

		const response = await testSessionFetch('http://localhost/guidelines')
		const body = await response.text()

		assert.match(body, /BND/)
		assert.match(body, /30/)
		assert.match(body, /bond/)
	})

	it('guidelines list fragment shows read-only target, hidden edit form, and delete dialog', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '25')

		const frag = await testSessionFetch(
			'http://localhost/fragments/guidelines-list',
		)
		const html = await frag.text()
		assert.equal(frag.status, 200)
		assert.match(html, /Your Guidelines/)
		assert.match(html, /data-guideline-read/)
		assert.match(html, /25\s*%/)
		assert.match(html, /data-guideline-edit/)
		assert.match(html, /data-guideline-original-target="25"/)
		assert.match(
			html,
			/data-guideline-edit-form="[^"]+"[^>]*class="[^"]*\bhidden\b/,
		)
		assert.match(html, /name="targetPct"/)
		assert.match(html, /value="25"/)
		assert.match(html, /!w-16/)
		assert.match(html, /<span[^>]*aria-hidden="true"[^>]*>\s*%\s*<\/span>/)
		assert.match(html, /bg-primary\/75/)
		assert.match(html, /role="img"/)
		assert.match(
			html,
			/aria-labelledby="guideline-delete-dialog-label-[a-f0-9-]+"/,
		)
		assert.match(html, /<dialog\b[^>]*id="guideline-delete-dialog-/)
		assert.match(html, /data-dialog-id="guideline-delete-dialog-/)
		assert.match(
			html,
			/Remove the[\s\S]*?guideline\?[\s\S]*?name="guidelineIntent"[\s\S]*?value="delete"/,
		)
	})

	it('updateTarget updates target % and keeps total within 100', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '40')

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const idMatch = listBody.match(/data-guideline-edit-form="([a-f0-9-]+)"/)
		assert.ok(idMatch, 'expected an update-target form')
		const id = idMatch[1]

		const postRes = await testSessionFetch(
			guidelineActionRequest({
				guidelineIntent: 'updateTarget',
				id,
				targetPct: '55',
			}),
		)
		assert.equal(postRes.status, 302)
		assert.equal(postRes.headers.get('location'), '/guidelines')

		const after = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		assert.match(after, /data-guideline-read/)
		assert.match(after, /55\s*%/)
		assert.match(after, /Total allocated:\s*<strong[^>]*>55%<\/strong>/)
	})

	it('updateTarget returns HTML list fragment on success when Accept is text/html', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '40')

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const idMatch = listBody.match(/data-guideline-edit-form="([a-f0-9-]+)"/)
		assert.ok(idMatch, 'expected an update-target form')
		const id = idMatch[1]

		const postRes = await testSessionFetch(
			guidelineActionRequest(
				{ guidelineIntent: 'updateTarget', id, targetPct: '55' },
				{ Accept: 'text/html' },
			),
		)
		assert.equal(postRes.status, 200)
		const ct = postRes.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await postRes.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /data-guideline-read/)
		assert.match(html, /55\s*%/)
		assert.match(html, /Total allocated:\s*<strong[^>]*>55%<\/strong>/)
	})

	it('addInstrument returns 422 HTML fragment when ticker not in catalog and Accept is text/html', async () => {
		await seedGuestCatalog()
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addInstrument',
					instrumentTicker: 'ZZZZ',
					targetPct: '10',
				},
				{ Accept: 'text/html' },
			),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /no longer in your catalog/)
	})

	it('addInstrument returns 422 HTML fragment when schema fails and Accept is text/html', async () => {
		await seedGuestCatalog()
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addInstrument',
					instrumentTicker: 'VTI',
					targetPct: '0',
				},
				{ Accept: 'text/html' },
			),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /Check the fund or bucket/)
	})

	it('addAssetClass returns 422 HTML when asset class not in catalog options and Accept is text/html', async () => {
		await seedGuestCatalog()
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addAssetClass',
					assetClassType: 'commodity',
					targetPct: '10',
				},
				{ Accept: 'text/html' },
			),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /no longer available/)
	})

	it('addInstrument returns HTML list fragment on success when Accept is text/html', async () => {
		await seedGuestCatalog()
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addInstrument',
					instrumentTicker: 'BND',
					targetPct: '30',
				},
				{ Accept: 'text/html' },
			),
		)
		assert.equal(response.status, 200)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /BND/)
		assert.match(html, /30/)
	})

	it('addAssetClass returns HTML list fragment on success when Accept is text/html', async () => {
		await seedGuestCatalog()
		const response = await testSessionFetch(
			guidelineActionRequest(
				{
					guidelineIntent: 'addAssetClass',
					assetClassType: 'equity',
					targetPct: '55',
				},
				{ Accept: 'text/html' },
			),
		)
		assert.equal(response.status, 200)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /equity \(bucket\)/)
	})

	it('updateTarget rejects when new total would exceed 100', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '60')
		await addInstrument('BND', '30')

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const bndMatch = listBody.match(
			/BND[\s\S]*?data-guideline-edit-form="([a-f0-9-]+)"/,
		)
		assert.ok(bndMatch, 'expected BND row update form')
		const bndId = bndMatch[1]

		const response = await testSessionFetch(
			guidelineActionRequest({
				guidelineIntent: 'updateTarget',
				id: bndId,
				targetPct: '50',
			}),
		)
		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines')

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /would make the total/)
		assert.match(body, /110/)
	})

	it('updateTarget returns 422 JSON when total would exceed 100 and Accept is JSON', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '60')
		await addInstrument('BND', '30')

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const bndMatch = listBody.match(
			/BND[\s\S]*?data-guideline-edit-form="([a-f0-9-]+)"/,
		)
		assert.ok(bndMatch)
		const bndId = bndMatch[1]

		const response = await testSessionFetch(
			guidelineActionRequest(
				{ guidelineIntent: 'updateTarget', id: bndId, targetPct: '50' },
				{ Accept: 'application/json' },
			),
		)
		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(data.error ?? '', /would make the total/)
	})

	it('updateTarget returns 422 HTML list fragment when total would exceed 100 and Accept is text/html', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '60')
		await addInstrument('BND', '30')

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const bndMatch = listBody.match(
			/BND[\s\S]*?data-guideline-edit-form="([a-f0-9-]+)"/,
		)
		assert.ok(bndMatch, 'expected BND row update form')
		const bndId = bndMatch[1]

		const response = await testSessionFetch(
			guidelineActionRequest(
				{ guidelineIntent: 'updateTarget', id: bndId, targetPct: '50' },
				{ Accept: 'text/html' },
			),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /would make the total/)
	})

	it('updateTarget returns 422 JSON when target % is out of schema range', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '40')

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const idMatch = listBody.match(/data-guideline-edit-form="([a-f0-9-]+)"/)
		assert.ok(idMatch)
		const id = idMatch[1]

		const response = await testSessionFetch(
			guidelineActionRequest(
				{ guidelineIntent: 'updateTarget', id, targetPct: '0' },
				{ Accept: 'application/json' },
			),
		)
		assert.equal(response.status, 422)
		const data = (await response.json()) as {
			error?: string
			issues?: { path: string; message: string }[]
		}
		assert.ok(data.error && data.error.length > 0)
		assert.ok(Array.isArray(data.issues))
	})

	it('updateTarget returns 422 HTML list fragment when target % is invalid and Accept is text/html', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '40')

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const idMatch = listBody.match(/data-guideline-edit-form="([a-f0-9-]+)"/)
		assert.ok(idMatch)
		const id = idMatch[1]

		const response = await testSessionFetch(
			guidelineActionRequest(
				{ guidelineIntent: 'updateTarget', id, targetPct: '0' },
				{ Accept: 'text/html' },
			),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
	})

	it('addInstrument ignores missing ticker', async () => {
		await seedGuestCatalog()
		const response = await testSessionFetch(
			guidelineActionRequest({
				guidelineIntent: 'addInstrument',
				targetPct: '50',
			}),
		)

		assert.equal(response.status, 302)

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /No guidelines/)
	})

	it('addInstrument rejects unknown ticker', async () => {
		await seedGuestCatalog()
		const response = await addInstrument('ZZZZ', '10')

		assert.equal(response.status, 302)

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /No guidelines/)
	})

	it('addAssetClass adds a bucket guideline', async () => {
		await seedGuestCatalog()
		const response = await addAssetClass('equity', '55')

		assert.equal(response.status, 302)

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /equity \(bucket\)/)
	})

	it('guidelines list delete uses dialog confirmation pattern', async () => {
		await seedGuestCatalog()
		await addInstrument('VNQ', '10')

		const listResponse = await testSessionFetch('http://localhost/guidelines')
		const listBody = await listResponse.text()
		assert.match(listBody, /<dialog\b[^>]*id="guideline-delete-dialog-/)
		assert.match(listBody, /data-dialog-id="guideline-delete-dialog-/)
		assert.match(
			listBody,
			/Remove the[\s\S]*?guideline\?[\s\S]*?name="guidelineIntent"[\s\S]*?value="delete"/,
		)
	})

	it('serves guidelines-list component entry for delete dialog', async () => {
		const componentScriptResponse = await testSessionFetch(
			'http://localhost/features/guidelines/guidelines-list.component.js',
		)
		assert.equal(componentScriptResponse.status, 200)
		assert.match(
			componentScriptResponse.headers.get('content-type') ?? '',
			/javascript/i,
			'expected JavaScript media type (text/javascript or application/javascript)',
		)
		const body = await componentScriptResponse.text()
		assert.match(body, /clientEntry/)
		assert.match(body, /openDialogForTrigger/)
		assert.match(body, /dialog-trigger\.js/)
		assert.match(body, /closest\('\[data-dialog-id\]'\)/)

		const dialogTriggerResponse = await testSessionFetch(
			'http://localhost/lib/dialog-trigger.js',
		)
		assert.equal(dialogTriggerResponse.status, 200)
		const dialogTriggerBody = await dialogTriggerResponse.text()
		assert.match(dialogTriggerBody, /showModal/)
	})

	it('delete removes the guideline', async () => {
		await seedGuestCatalog()
		await addInstrument('VNQ', '10')

		const listResponse = await testSessionFetch('http://localhost/guidelines')
		const listBody = await listResponse.text()
		const idMatch = listBody.match(
			/data-dialog-id="guideline-delete-dialog-([a-f0-9-]+)"/,
		)
		assert.ok(idMatch, 'delete dialog trigger should be present')
		const id = idMatch[1]

		const deleteResponse = await testSessionFetch(
			guidelineActionRequest({ guidelineIntent: 'delete', id }),
		)

		assert.equal(deleteResponse.status, 302)
		assert.equal(deleteResponse.headers.get('location'), '/guidelines')

		const afterBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		assert.match(afterBody, /No guidelines/)
	})

	it('delete returns HTML list fragment when Accept is text/html', async () => {
		await seedGuestCatalog()
		await addInstrument('VNQ', '10')

		const listResponse = await testSessionFetch('http://localhost/guidelines')
		const listBody = await listResponse.text()
		const idMatch = listBody.match(
			/data-dialog-id="guideline-delete-dialog-([a-f0-9-]+)"/,
		)
		assert.ok(idMatch, 'delete dialog trigger should be present')
		const id = idMatch[1]

		const deleteResponse = await testSessionFetch(
			guidelineActionRequest(
				{ guidelineIntent: 'delete', id },
				{ Accept: 'text/html' },
			),
		)

		assert.equal(deleteResponse.status, 200)
		const ct = deleteResponse.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await deleteResponse.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /No guidelines added yet/)
	})

	it('guidelines page renders a named Frame for the list', async () => {
		const response = await testSessionFetch('http://localhost/guidelines')
		const body = await response.text()
		assert.match(body, /rmx:f:/)
		assert.match(body, /"name":"guidelines-list"/)
	})

	it('add forms use native data-rmx-target for Frame-based list reload', async () => {
		const response = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const body = await response.text()
		assert.match(body, /data-rmx-target="guidelines-list"/)
		assert.doesNotMatch(body, /data-frame-submit=/)
		assert.doesNotMatch(body, /data-frame-replace-from-response/)
	})

	it('update-target and delete forms use native data-rmx-target for Frame-based list reload', async () => {
		await seedGuestCatalog()
		await addInstrument('VTI', '25')

		const frag = await testSessionFetch(
			'http://localhost/fragments/guidelines-list',
		)
		const html = await frag.text()
		assert.match(html, /data-rmx-target="guidelines-list"/)
		assert.match(html, /name="guidelineIntent"[^>]*value="updateTarget"/)
		assert.match(html, /name="guidelineIntent"[^>]*value="delete"/)
		assert.doesNotMatch(html, /data-frame-submit=/)
		assert.doesNotMatch(html, /data-frame-replace-from-response/)
		assert.doesNotMatch(html, /name="_method"/)
	})
})
