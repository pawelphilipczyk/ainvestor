import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { resetGuestGuidelines } from './index.ts'

afterEach(() => {
	resetGuestGuidelines()
})

describe('Guidelines page', () => {
	it('GET /guidelines returns 200 with the guidelines form', async () => {
		const response = await router.fetch('http://localhost/guidelines')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Investment Guidelines/)
		assert.match(body, /name="etfName"/)
		assert.match(body, /name="targetPct"/)
		assert.match(body, /name="etfType"/)
	})

	it('POST /guidelines adds a guideline and redirects', async () => {
		const form = new FormData()
		form.set('etfName', 'VTI')
		form.set('targetPct', '60')
		form.set('etfType', 'equity')

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
		const form = new FormData()
		form.set('etfName', 'BND')
		form.set('targetPct', '30')
		form.set('etfType', 'bond')

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

	it('POST /guidelines ignores submission with missing etfName', async () => {
		const form = new FormData()
		form.set('targetPct', '50')
		form.set('etfType', 'equity')

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

	it('DELETE /guidelines/:id removes the guideline via method override', async () => {
		const addForm = new FormData()
		addForm.set('etfName', 'VNQ')
		addForm.set('targetPct', '10')
		addForm.set('etfType', 'real_estate')
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

		const afterBody = await (
			await router.fetch('http://localhost/guidelines')
		).text()
		assert.match(afterBody, /No guidelines/)
	})
})
