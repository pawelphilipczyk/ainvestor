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
		assert.match(body, /action="\/guidelines\/asset-class"/)
		assert.match(body, /name="assetClassType"/)
		assert.match(body, /Specific ETF target/)
		assert.match(body, /Asset class bucket/)

		const instrumentPage = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const instrumentBody = await instrumentPage.text()
		assert.match(instrumentBody, /action="\/guidelines\/instrument"/)
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

	it('POST /guidelines/instrument adds a guideline and redirects', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('targetPct', '60')

		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines?tab=instrument')
	})

	it('POST /guidelines/instrument rejects duplicate ticker with flash message', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('instrumentTicker', 'VTI')
		first.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('instrumentTicker', 'VTI')
		second.set('targetPct', '30')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: second,
			}),
		)

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines?tab=instrument')

		const page = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const body = await page.text()
		assert.match(body, /already have a guideline for VTI/)
		assert.match(body, /edit or remove that line/)
		const deleteActions = body.match(/action="\/guidelines\/[a-f0-9-]+"/g) ?? []
		assert.equal(deleteActions.length, 1)
	})

	it('POST /guidelines/instrument returns 422 JSON for duplicate ticker when Accept is JSON', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('instrumentTicker', 'VTI')
		first.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('instrumentTicker', ' vti ')
		second.set('targetPct', '30')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: second,
				headers: { Accept: 'application/json' },
			}),
		)

		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(data.error ?? '', /already have a guideline for VTI/)
	})

	it('POST /guidelines/instrument returns 422 HTML list fragment for duplicate when Accept is text/html', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('instrumentTicker', 'VTI')
		first.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('instrumentTicker', ' vti ')
		second.set('targetPct', '30')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: second,
				headers: { Accept: 'text/html' },
			}),
		)

		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /already have a guideline for VTI/)
	})

	it('POST /guidelines/asset-class rejects duplicate asset class with flash message', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('assetClassType', 'equity')
		first.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('assetClassType', 'equity')
		second.set('targetPct', '30')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: second,
			}),
		)

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines')

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /already have a guideline for the equity asset class/)
		assert.match(body, /edit or remove that line/)
		const deleteActions = body.match(/action="\/guidelines\/[a-f0-9-]+"/g) ?? []
		assert.equal(deleteActions.length, 1)
	})

	it('POST /guidelines/asset-class returns 422 JSON for duplicate asset class when Accept is JSON', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('assetClassType', 'equity')
		first.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('assetClassType', 'equity')
		second.set('targetPct', '30')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: second,
				headers: { Accept: 'application/json' },
			}),
		)

		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(
			data.error ?? '',
			/already have a guideline for the equity asset class/,
		)
	})

	it('POST /guidelines/asset-class returns 422 HTML list fragment for duplicate when Accept is text/html', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('assetClassType', 'equity')
		first.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('assetClassType', 'equity')
		second.set('targetPct', '30')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: second,
				headers: { Accept: 'text/html' },
			}),
		)

		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /already have a guideline for the equity asset class/)
	})

	it('POST /guidelines/instrument rejects when total target % would exceed 100', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('instrumentTicker', 'VTI')
		first.set('targetPct', '60')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('instrumentTicker', 'BND')
		second.set('targetPct', '50')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: second,
			}),
		)

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines?tab=instrument')

		const page = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const body = await page.text()
		assert.match(body, /cannot add up to more than 100%/)
		assert.match(body, /60/)
		assert.match(body, /50/)
		const deleteActions = body.match(/action="\/guidelines\/[a-f0-9-]+"/g) ?? []
		assert.equal(
			deleteActions.length,
			1,
			'expected only the first guideline after rejected over-cap add',
		)
	})

	it('POST /guidelines/instrument returns 422 JSON when total would exceed 100 and Accept is JSON', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('instrumentTicker', 'VTI')
		first.set('targetPct', '60')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('instrumentTicker', 'BND')
		second.set('targetPct', '50')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: second,
				headers: { Accept: 'application/json' },
			}),
		)

		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(data.error ?? '', /cannot add up to more than 100%/)
	})

	it('POST /guidelines/instrument returns 422 HTML list fragment when total would exceed 100 and Accept is text/html', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('instrumentTicker', 'VTI')
		first.set('targetPct', '60')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('instrumentTicker', 'BND')
		second.set('targetPct', '50')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: second,
				headers: { Accept: 'text/html' },
			}),
		)

		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /cannot add up to more than 100%/)
	})

	it('POST /guidelines/asset-class rejects when total target % would exceed 100', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('assetClassType', 'equity')
		first.set('targetPct', '60')
		await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('assetClassType', 'bond')
		second.set('targetPct', '50')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: second,
			}),
		)

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines')

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /cannot add up to more than 100%/)
		assert.match(body, /60/)
		assert.match(body, /50/)
		const deleteActions = body.match(/action="\/guidelines\/[a-f0-9-]+"/g) ?? []
		assert.equal(
			deleteActions.length,
			1,
			'expected only the first guideline after rejected over-cap add',
		)
	})

	it('POST /guidelines/asset-class returns 422 JSON when total would exceed 100 and Accept is JSON', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('assetClassType', 'equity')
		first.set('targetPct', '60')
		await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('assetClassType', 'bond')
		second.set('targetPct', '50')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: second,
				headers: { Accept: 'application/json' },
			}),
		)

		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(data.error ?? '', /cannot add up to more than 100%/)
	})

	it('POST /guidelines/asset-class returns 422 HTML list fragment when total would exceed 100 and Accept is text/html', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('assetClassType', 'equity')
		first.set('targetPct', '60')
		await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: first,
			}),
		)

		const second = new FormData()
		second.set('assetClassType', 'bond')
		second.set('targetPct', '50')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: second,
				headers: { Accept: 'text/html' },
			}),
		)

		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /cannot add up to more than 100%/)
	})

	it('POST /guidelines/instrument accepts locale-style target % (comma decimal)', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('targetPct', '12,5')

		const postResponse = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: form,
			}),
		)

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
		const form = new FormData()
		form.set('instrumentTicker', 'BND')
		form.set('targetPct', '30')

		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: form,
			}),
		)

		const response = await testSessionFetch('http://localhost/guidelines')
		const body = await response.text()

		assert.match(body, /BND/)
		assert.match(body, /30/)
		assert.match(body, /bond/)
	})

	it('guidelines list fragment shows read-only target, hidden edit form, and delete dialog', async () => {
		await seedGuestCatalog()
		const add = new FormData()
		add.set('instrumentTicker', 'VTI')
		add.set('targetPct', '25')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: add,
			}),
		)

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
		assert.match(html, /<form[^>]*\bhidden\b[^>]*data-guideline-edit-form/)
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
			/Remove the[\s\S]*?guideline\?[\s\S]*?name="_method"[\s\S]*?value="DELETE"/,
		)
	})

	it('POST /guidelines/:id/target updates target % and keeps total within 100', async () => {
		await seedGuestCatalog()
		const add = new FormData()
		add.set('instrumentTicker', 'VTI')
		add.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: add,
			}),
		)

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const idMatch = listBody.match(
			/action="\/guidelines\/([a-f0-9-]+)\/target"/,
		)
		assert.ok(idMatch, 'expected update target form action')
		const id = idMatch[1]

		const update = new FormData()
		update.set('targetPct', '55')
		const postRes = await testSessionFetch(
			new Request(`http://localhost/guidelines/${id}/target`, {
				method: 'POST',
				body: update,
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

	it('POST /guidelines/:id/target returns HTML list fragment on success when Accept is text/html', async () => {
		await seedGuestCatalog()
		const add = new FormData()
		add.set('instrumentTicker', 'VTI')
		add.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: add,
			}),
		)

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const idMatch = listBody.match(
			/action="\/guidelines\/([a-f0-9-]+)\/target"/,
		)
		assert.ok(idMatch, 'expected update target form action')
		const id = idMatch[1]

		const update = new FormData()
		update.set('targetPct', '55')
		const postRes = await testSessionFetch(
			new Request(`http://localhost/guidelines/${id}/target`, {
				method: 'POST',
				body: update,
				headers: { Accept: 'text/html' },
			}),
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

	it('POST /guidelines/instrument returns 422 HTML fragment when ticker not in catalog and Accept is text/html', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'ZZZZ')
		form.set('targetPct', '10')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: form,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /no longer in your catalog/)
	})

	it('POST /guidelines/instrument returns 422 HTML fragment when schema fails and Accept is text/html', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('targetPct', '0')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: form,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /Check the fund or bucket/)
	})

	it('POST /guidelines/asset-class returns 422 HTML when asset class not in catalog options and Accept is text/html', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('assetClassType', 'commodity')
		form.set('targetPct', '10')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: form,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /no longer available/)
	})

	it('POST /guidelines/instrument returns HTML list fragment on success when Accept is text/html', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'BND')
		form.set('targetPct', '30')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: form,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(response.status, 200)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /BND/)
		assert.match(html, /30/)
	})

	it('POST /guidelines/asset-class returns HTML list fragment on success when Accept is text/html', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('targetPct', '55')
		form.set('assetClassType', 'equity')
		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: form,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(response.status, 200)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /equity \(bucket\)/)
	})

	it('POST /guidelines/:id/target rejects when new total would exceed 100', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('instrumentTicker', 'VTI')
		first.set('targetPct', '60')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: first,
			}),
		)
		const second = new FormData()
		second.set('instrumentTicker', 'BND')
		second.set('targetPct', '30')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: second,
			}),
		)

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const bndMatch = listBody.match(
			/BND[\s\S]*?action="\/guidelines\/([a-f0-9-]+)\/target"/,
		)
		assert.ok(bndMatch, 'expected BND row update form')
		const bndId = bndMatch[1]

		const update = new FormData()
		update.set('targetPct', '50')
		const response = await testSessionFetch(
			new Request(`http://localhost/guidelines/${bndId}/target`, {
				method: 'POST',
				body: update,
			}),
		)
		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines')

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /would make the total/)
		assert.match(body, /110/)
	})

	it('POST /guidelines/:id/target returns 422 JSON when total would exceed 100 and Accept is JSON', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('instrumentTicker', 'VTI')
		first.set('targetPct', '60')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: first,
			}),
		)
		const second = new FormData()
		second.set('instrumentTicker', 'BND')
		second.set('targetPct', '30')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: second,
			}),
		)

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const bndMatch = listBody.match(
			/BND[\s\S]*?action="\/guidelines\/([a-f0-9-]+)\/target"/,
		)
		assert.ok(bndMatch)
		const bndId = bndMatch[1]

		const update = new FormData()
		update.set('targetPct', '50')
		const response = await testSessionFetch(
			new Request(`http://localhost/guidelines/${bndId}/target`, {
				method: 'POST',
				body: update,
				headers: { Accept: 'application/json' },
			}),
		)
		assert.equal(response.status, 422)
		const data = (await response.json()) as { error?: string }
		assert.match(data.error ?? '', /would make the total/)
	})

	it('POST /guidelines/:id/target returns 422 HTML list fragment when total would exceed 100 and Accept is text/html', async () => {
		await seedGuestCatalog()
		const first = new FormData()
		first.set('instrumentTicker', 'VTI')
		first.set('targetPct', '60')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: first,
			}),
		)
		const second = new FormData()
		second.set('instrumentTicker', 'BND')
		second.set('targetPct', '30')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: second,
			}),
		)

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const bndMatch = listBody.match(
			/BND[\s\S]*?action="\/guidelines\/([a-f0-9-]+)\/target"/,
		)
		assert.ok(bndMatch, 'expected BND row update form')
		const bndId = bndMatch[1]

		const update = new FormData()
		update.set('targetPct', '50')
		const response = await testSessionFetch(
			new Request(`http://localhost/guidelines/${bndId}/target`, {
				method: 'POST',
				body: update,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
		assert.match(html, /would make the total/)
	})

	it('POST /guidelines/:id/target returns 422 JSON when target % is out of schema range', async () => {
		await seedGuestCatalog()
		const add = new FormData()
		add.set('instrumentTicker', 'VTI')
		add.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: add,
			}),
		)

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const idMatch = listBody.match(
			/action="\/guidelines\/([a-f0-9-]+)\/target"/,
		)
		assert.ok(idMatch)
		const id = idMatch[1]

		const update = new FormData()
		update.set('targetPct', '0')
		const response = await testSessionFetch(
			new Request(`http://localhost/guidelines/${id}/target`, {
				method: 'POST',
				body: update,
				headers: { Accept: 'application/json' },
			}),
		)
		assert.equal(response.status, 422)
		const data = (await response.json()) as {
			error?: string
			issues?: { path: string; message: string }[]
		}
		assert.ok(data.error && data.error.length > 0)
		assert.ok(Array.isArray(data.issues))
	})

	it('POST /guidelines/:id/target returns 422 HTML list fragment when target % is invalid and Accept is text/html', async () => {
		await seedGuestCatalog()
		const add = new FormData()
		add.set('instrumentTicker', 'VTI')
		add.set('targetPct', '40')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: add,
			}),
		)

		const listBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		const idMatch = listBody.match(
			/action="\/guidelines\/([a-f0-9-]+)\/target"/,
		)
		assert.ok(idMatch)
		const id = idMatch[1]

		const update = new FormData()
		update.set('targetPct', '0')
		const response = await testSessionFetch(
			new Request(`http://localhost/guidelines/${id}/target`, {
				method: 'POST',
				body: update,
				headers: { Accept: 'text/html' },
			}),
		)
		assert.equal(response.status, 422)
		const ct = response.headers.get('content-type') ?? ''
		assert.match(ct, /text\/html/)
		const html = await response.text()
		assert.match(html, /Your Guidelines/)
	})

	it('POST /guidelines/instrument ignores missing ticker', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('targetPct', '50')

		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(response.status, 302)

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /No guidelines/)
	})

	it('POST /guidelines/instrument rejects unknown ticker', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'ZZZZ')
		form.set('targetPct', '10')

		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(response.status, 302)

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /No guidelines/)
	})

	it('POST /guidelines/asset-class adds a bucket guideline', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('targetPct', '55')
		form.set('assetClassType', 'equity')

		const response = await testSessionFetch(
			new Request('http://localhost/guidelines/asset-class', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(response.status, 302)

		const page = await testSessionFetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /equity \(bucket\)/)
	})

	it('guidelines list delete uses dialog confirmation pattern', async () => {
		await seedGuestCatalog()
		const addForm = new FormData()
		addForm.set('instrumentTicker', 'VNQ')
		addForm.set('targetPct', '10')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: addForm,
			}),
		)

		const listResponse = await testSessionFetch('http://localhost/guidelines')
		const listBody = await listResponse.text()
		assert.match(listBody, /<dialog\b[^>]*id="guideline-delete-dialog-/)
		assert.match(listBody, /data-dialog-id="guideline-delete-dialog-/)
		assert.match(
			listBody,
			/Remove the[\s\S]*?guideline\?[\s\S]*?name="_method"[\s\S]*?value="DELETE"/,
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

	it('DELETE /guidelines/:id removes the guideline via method override', async () => {
		await seedGuestCatalog()
		const addForm = new FormData()
		addForm.set('instrumentTicker', 'VNQ')
		addForm.set('targetPct', '10')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: addForm,
			}),
		)

		const listResponse = await testSessionFetch('http://localhost/guidelines')
		const listBody = await listResponse.text()
		const idMatch = listBody.match(
			/action="\/guidelines\/([a-f0-9-]+)"[^>]*>[\s\S]*?name="_method"[\s\S]*?value="DELETE"/,
		)
		assert.ok(idMatch, 'delete form action should be present')
		const id = idMatch[1]

		const deleteForm = new FormData()
		deleteForm.set('_method', 'DELETE')
		const deleteResponse = await testSessionFetch(
			new Request(`http://localhost/guidelines/${id}`, {
				method: 'POST',
				body: deleteForm,
			}),
		)

		assert.equal(deleteResponse.status, 302)
		assert.equal(deleteResponse.headers.get('location'), '/guidelines')

		const afterBody = await (
			await testSessionFetch('http://localhost/guidelines')
		).text()
		assert.match(afterBody, /No guidelines/)
	})

	it('DELETE /guidelines/:id returns HTML list fragment when Accept is text/html', async () => {
		await seedGuestCatalog()
		const addForm = new FormData()
		addForm.set('instrumentTicker', 'VNQ')
		addForm.set('targetPct', '10')
		await testSessionFetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: addForm,
			}),
		)

		const listResponse = await testSessionFetch('http://localhost/guidelines')
		const listBody = await listResponse.text()
		const idMatch = listBody.match(
			/action="\/guidelines\/([a-f0-9-]+)"[^>]*>[\s\S]*?name="_method"[\s\S]*?value="DELETE"/,
		)
		assert.ok(idMatch, 'delete form action should be present')
		const id = idMatch[1]

		const deleteForm = new FormData()
		deleteForm.set('_method', 'DELETE')
		const deleteResponse = await testSessionFetch(
			new Request(`http://localhost/guidelines/${id}`, {
				method: 'POST',
				body: deleteForm,
				headers: { Accept: 'text/html' },
			}),
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

	it('forms use data-frame-submit for Frame-based list reload', async () => {
		const response = await testSessionFetch(
			'http://localhost/guidelines?tab=instrument',
		)
		const body = await response.text()
		assert.match(body, /data-frame-submit="guidelines-list"/)
		assert.match(body, /data-frame-replace-from-response/)
	})
})
