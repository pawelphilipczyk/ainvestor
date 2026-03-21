import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { router } from '../../router.ts'
import { resetGuestCatalog } from '../catalog/index.ts'
import { resetGuestGuidelines } from './index.ts'

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
	await router.fetch(
		new Request('http://localhost/catalog/import', {
			method: 'POST',
			body: bankJson,
			headers: { 'Content-Type': 'application/json' },
		}),
	)
}

afterEach(() => {
	resetGuestGuidelines()
	resetGuestCatalog()
})

describe('Guidelines page', () => {
	it('GET /guidelines returns 200 with the guidelines form', async () => {
		await seedGuestCatalog()
		const response = await router.fetch('http://localhost/guidelines')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Investment Guidelines/)
		assert.match(body, /name="kind"/)
		assert.match(body, /name="instrumentTicker"/)
		assert.match(body, /name="targetPct"/)
		assert.match(body, /name="assetClassType"/)
		assert.match(body, /guidelines-panel-instrument/)
		assert.match(body, /guidelines-panel-asset-class/)
	})

	it('POST /guidelines adds a guideline and redirects', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'VTI')
		form.set('targetPct', '60')
		form.set('kind', 'instrument')

		const response = await router.fetch(
			new Request('http://localhost/guidelines', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/guidelines')
	})

	it('added guideline appears on the guidelines page', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'BND')
		form.set('targetPct', '30')
		form.set('kind', 'instrument')

		await router.fetch(
			new Request('http://localhost/guidelines', {
				method: 'POST',
				body: form,
			}),
		)

		const response = await router.fetch('http://localhost/guidelines')
		const body = await response.text()

		assert.match(body, /BND/)
		assert.match(body, /30/)
		assert.match(body, /bond/)
	})

	it('POST /guidelines ignores submission with missing instrument ticker', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('targetPct', '50')
		form.set('kind', 'instrument')

		const response = await router.fetch(
			new Request('http://localhost/guidelines', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(response.status, 302)

		const page = await router.fetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /No guidelines/)
	})

	it('POST /guidelines rejects unknown ticker', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('instrumentTicker', 'ZZZZ')
		form.set('targetPct', '10')
		form.set('kind', 'instrument')

		const response = await router.fetch(
			new Request('http://localhost/guidelines', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(response.status, 302)

		const page = await router.fetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /No guidelines/)
	})

	it('POST /guidelines accepts asset_class without instrument ticker', async () => {
		await seedGuestCatalog()
		const form = new FormData()
		form.set('targetPct', '55')
		form.set('assetClassType', 'equity')
		form.set('kind', 'asset_class')

		const response = await router.fetch(
			new Request('http://localhost/guidelines', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(response.status, 302)

		const page = await router.fetch('http://localhost/guidelines')
		const body = await page.text()
		assert.match(body, /equity \(bucket\)/)
	})

	it('DELETE /guidelines/:id removes the guideline via method override', async () => {
		await seedGuestCatalog()
		const addForm = new FormData()
		addForm.set('instrumentTicker', 'VNQ')
		addForm.set('targetPct', '10')
		addForm.set('kind', 'instrument')
		await router.fetch(
			new Request('http://localhost/guidelines', {
				method: 'POST',
				body: addForm,
			}),
		)

		const listResponse = await router.fetch('http://localhost/guidelines')
		const listBody = await listResponse.text()
		const idMatch = listBody.match(/action="\/guidelines\/([a-f0-9-]+)"/)
		assert.ok(idMatch, 'delete form action should be present')
		const id = idMatch[1]

		const deleteForm = new FormData()
		deleteForm.set('_method', 'DELETE')
		const deleteResponse = await router.fetch(
			new Request(`http://localhost/guidelines/${id}`, {
				method: 'POST',
				body: deleteForm,
			}),
		)

		assert.equal(deleteResponse.status, 302)
		assert.equal(deleteResponse.headers.get('location'), '/guidelines')

		const afterBody = await (
			await router.fetch('http://localhost/guidelines')
		).text()
		assert.match(afterBody, /No guidelines/)
	})
})
