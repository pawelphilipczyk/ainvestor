import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { AdviceClient } from '../../openai.ts'
import { router } from '../../router.ts'
import { resetGuestCatalog } from '../catalog/index.ts'
import { resetGuestGuidelines } from '../guidelines/index.ts'
import { resetEtfEntries } from '../portfolio/index.ts'
import { setAdviceClient } from './index.ts'

function makeMockClient(responseText: string): AdviceClient {
	const content = (() => {
		try {
			const parsed = JSON.parse(responseText) as unknown
			if (parsed !== null && typeof parsed === 'object' && 'blocks' in parsed) {
				return responseText
			}
		} catch {
			// plain text from tests → wrap as paragraph block JSON
		}
		return JSON.stringify({
			blocks: [{ type: 'paragraph', text: responseText }],
		})
	})()
	return {
		chat: {
			completions: {
				create: async () => ({
					choices: [{ message: { content: content } }],
				}),
			},
		},
	}
}

afterEach(() => {
	resetEtfEntries()
	resetGuestGuidelines()
	resetGuestCatalog()
	setAdviceClient(null)
})

describe('Advice', () => {
	it('GET /advice renders the Get Advice form page', async () => {
		const response = await router.fetch('http://localhost/advice')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Get Advice/)
		assert.match(body, /name="cashAmount"/)
		assert.match(body, /name="cashCurrency"/)
		assert.match(body, /action="\/advice"/)
	})

	it('returns 400 with AdvicePage HTML when cashAmount is missing', async () => {
		setAdviceClient(makeMockClient('irrelevant'))

		const response = await router.fetch(
			new Request('http://localhost/advice', {
				method: 'POST',
				body: new FormData(),
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 400)
		assert.match(body, /Get Advice/)
		assert.match(body, /role="alert"/)
		assert.match(body, /<summary[^>]*>/)
		assert.match(body, /Enter a valid cash amount and currency\./)
		assert.match(body, /cashAmount:/)
	})

	it('returns 503 with AdvicePage HTML when the advice client throws', async () => {
		setAdviceClient({
			chat: {
				completions: {
					create: async () => {
						throw new Error('simulated API failure')
					},
				},
			},
		})

		const form = new FormData()
		form.set('cashAmount', '100')

		const response = await router.fetch(
			new Request('http://localhost/advice', { method: 'POST', body: form }),
		)
		const body = await response.text()

		assert.equal(response.status, 503)
		assert.match(body, /Get Advice/)
		assert.match(body, /role="alert"/)
		assert.match(
			body,
			/We couldn't get advice right now\. Please try again in a moment\./,
		)
		assert.match(body, /<summary[^>]*>/)
		assert.match(body, /simulated API failure/)
	})

	it('returns 503 with AdvicePage HTML when the default OpenAI client cannot be created', async () => {
		const prevKey = process.env.OPENAI_API_KEY
		delete process.env.OPENAI_API_KEY

		try {
			const form = new FormData()
			form.set('cashAmount', '100')

			const response = await router.fetch(
				new Request('http://localhost/advice', { method: 'POST', body: form }),
			)
			const body = await response.text()

			assert.equal(response.status, 503)
			assert.match(body, /Get Advice/)
			assert.match(body, /role="alert"/)
			assert.match(
				body,
				/We couldn't get advice right now\. Please try again in a moment\./,
			)
			assert.match(body, /<details>/)
			assert.match(body, /<summary[^>]*>/)
		} finally {
			if (prevKey === undefined) {
				delete process.env.OPENAI_API_KEY
			} else {
				process.env.OPENAI_API_KEY = prevKey
			}
		}
	})

	it('returns advice HTML from the LLM when cashAmount is provided', async () => {
		setAdviceClient(makeMockClient('Buy VTI for broad market exposure.'))

		const form = new FormData()
		form.set('cashAmount', '1000')

		const response = await router.fetch(
			new Request('http://localhost/advice', { method: 'POST', body: form }),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Investment Advice/)
		assert.match(body, /Buy VTI for broad market exposure\./)
	})

	it('renders an ETF proposals table when the model returns etf_proposals blocks', async () => {
		setAdviceClient(
			makeMockClient(
				JSON.stringify({
					blocks: [
						{
							type: 'paragraph',
							text: 'Consider adding to international exposure.',
						},
						{
							type: 'etf_proposals',
							caption: 'Suggested purchases',
							rows: [
								{
									name: 'Vanguard Total International Stock',
									ticker: 'VXUS',
									amount: 400,
									currency: 'PLN',
									note: 'Broad ex-US equities',
								},
							],
						},
					],
				}),
			),
		)

		const form = new FormData()
		form.set('cashAmount', '500')

		const response = await router.fetch(
			new Request('http://localhost/advice', { method: 'POST', body: form }),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Suggested purchases/)
		assert.match(body, /VXUS/)
		assert.match(body, /400\.00/)
		assert.match(body, /PLN/)
		assert.match(body, /Broad ex-US equities/)
	})

	it('includes current ETF holdings in the advice context', async () => {
		let capturedUserMessage = ''
		setAdviceClient({
			chat: {
				completions: {
					create: async (params) => {
						capturedUserMessage = params.messages[1].content
						return { choices: [{ message: { content: 'advice' } }] }
					},
				},
			},
		})

		const bankJson = JSON.stringify({
			data: [{ fund_name: 'VXUS', ticker: 'VXUS', assets: 'akcje' }],
			count: 1,
		})
		await router.fetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: bankJson,
				headers: { 'Content-Type': 'application/json' },
			}),
		)

		const addForm = new FormData()
		addForm.set('instrumentTicker', 'VXUS')
		addForm.set('value', '3000')
		addForm.set('currency', 'USD')
		await router.fetch(
			new Request('http://localhost/etfs', { method: 'POST', body: addForm }),
		)

		const adviceForm = new FormData()
		adviceForm.set('cashAmount', '500')
		await router.fetch(
			new Request('http://localhost/advice', {
				method: 'POST',
				body: adviceForm,
			}),
		)

		assert.match(capturedUserMessage, /VXUS/)
		assert.match(capturedUserMessage, /3000 USD/)
		assert.match(capturedUserMessage, /500 PLN/)
		assert.match(capturedUserMessage, /ETF catalog/)
		assert.match(capturedUserMessage, /Allocation context/)
	})

	it('passes guidelines into the advice prompt when they exist', async () => {
		let capturedUserMessage = ''
		setAdviceClient({
			chat: {
				completions: {
					create: async (params) => {
						capturedUserMessage = params.messages[1].content
						return { choices: [{ message: { content: 'advice' } }] }
					},
				},
			},
		})

		const bankJson = JSON.stringify({
			data: [{ fund_name: 'Vanguard Total', ticker: 'VTI', assets: 'akcje' }],
			count: 1,
		})
		await router.fetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: bankJson,
				headers: { 'Content-Type': 'application/json' },
			}),
		)

		const guidelineForm = new FormData()
		guidelineForm.set('instrumentTicker', 'VTI')
		guidelineForm.set('targetPct', '60')
		await router.fetch(
			new Request('http://localhost/guidelines/instrument', {
				method: 'POST',
				body: guidelineForm,
			}),
		)

		const adviceForm = new FormData()
		adviceForm.set('cashAmount', '1000')
		await router.fetch(
			new Request('http://localhost/advice', {
				method: 'POST',
				body: adviceForm,
			}),
		)

		assert.match(capturedUserMessage, /VTI.*60%/)
		assert.match(capturedUserMessage, /equity/)
	})
})
