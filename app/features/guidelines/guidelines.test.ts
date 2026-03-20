import * as assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { AdviceClient } from '../../openai.ts'
import { setGuidelinesAnalysisClient } from '../../openai.ts'
import { router } from '../../router.ts'
import { resetGuestGuidelines } from './index.ts'

function makeMockAnalysisClient(responseText: string): AdviceClient {
	return {
		chat: {
			completions: {
				create: async () => ({
					choices: [{ message: { content: responseText } }],
				}),
			},
		},
	}
}

afterEach(() => {
	resetGuestGuidelines()
	setGuidelinesAnalysisClient(null)
})

describe('Guidelines page', () => {
	beforeEach(() => {
		setGuidelinesAnalysisClient(makeMockAnalysisClient('Review text.'))
	})

	it('GET /guidelines returns 200 with the guidelines form', async () => {
		const response = await router.fetch('http://localhost/guidelines')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Investment Guidelines/)
		assert.match(body, /name="kind"/)
		assert.match(body, /name="etfName"/)
		assert.match(body, /name="targetPct"/)
		assert.match(body, /name="etfType"/)
	})

	it('POST /guidelines adds a guideline and returns HTML with analysis', async () => {
		const form = new FormData()
		form.set('etfName', 'VTI')
		form.set('targetPct', '60')
		form.set('etfType', 'equity')
		form.set('kind', 'instrument')

		const response = await router.fetch(
			new Request('http://localhost/guidelines', {
				method: 'POST',
				body: form,
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /AI review/)
		assert.match(body, /Review text\./)
	})

	it('added guideline appears on the guidelines page', async () => {
		const form = new FormData()
		form.set('etfName', 'BND')
		form.set('targetPct', '30')
		form.set('etfType', 'bond')
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

	it('POST /guidelines ignores submission with missing etfName for instrument', async () => {
		const form = new FormData()
		form.set('targetPct', '50')
		form.set('etfType', 'equity')
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

	it('POST /guidelines accepts asset_class without etfName', async () => {
		const form = new FormData()
		form.set('targetPct', '55')
		form.set('etfType', 'equity')
		form.set('kind', 'asset_class')

		const response = await router.fetch(
			new Request('http://localhost/guidelines', {
				method: 'POST',
				body: form,
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /equity \(bucket\)/)
		assert.match(body, /AI review/)
	})

	it('DELETE /guidelines/:id removes the guideline via method override', async () => {
		const addForm = new FormData()
		addForm.set('etfName', 'VNQ')
		addForm.set('targetPct', '10')
		addForm.set('etfType', 'real_estate')
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

		assert.equal(deleteResponse.status, 200)
		const deleteBody = await deleteResponse.text()
		assert.match(deleteBody, /No guidelines are set yet/)

		const afterBody = await (
			await router.fetch('http://localhost/guidelines')
		).text()
		assert.match(afterBody, /No guidelines/)
	})
})
