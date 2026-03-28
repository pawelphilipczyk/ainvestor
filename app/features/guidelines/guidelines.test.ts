import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
	resetTestSessionCookieJar,
	testSessionFetch,
} from '../../lib/test-session-fetch.ts'

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
	await testSessionFetch(
		new Request('http://localhost/catalog/import', {
			method: 'POST',
			body: bankJson,
			headers: { 'Content-Type': 'application/json' },
		}),
	)
}

afterEach(() => {
	resetTestSessionCookieJar()
})

describe('Guidelines page', () => {
	it('GET /guidelines returns 200 with two boxed forms', async () => {
		await seedGuestCatalog()
		const response = await testSessionFetch('http://localhost/guidelines')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Investment Guidelines/)
		assert.match(body, /action="\/guidelines\/instrument"/)
		assert.match(body, /action="\/guidelines\/asset-class"/)
		assert.match(body, /name="instrumentTicker"/)
		assert.match(body, /Specific ETF target/)
		assert.match(body, /Asset class bucket/)
		assert.match(body, /Remaining:\s*<strong[^>]*>100%<\/strong>/)
		assert.match(body, /No guidelines added yet\./)
	})

	it('Target % fields use money-style decimal input (numeric keypad)', async () => {
		await seedGuestCatalog()
		const response = await testSessionFetch('http://localhost/guidelines')
		const body = await response.text()

		const instrumentPct = body.match(
			/<input\b[^>]*\bid="instrumentTargetPct"[^>]*>/,
		)
		const assetPct = body.match(/<input\b[^>]*\bid="assetTargetPct"[^>]*>/)
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
		assert.equal(response.headers.get('location'), '/guidelines')
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
		assert.equal(postResponse.headers.get('location'), '/guidelines')

		const page = await testSessionFetch('http://localhost/guidelines')
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
		const idMatch = listBody.match(/action="\/guidelines\/([a-f0-9-]+)"/)
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
})
