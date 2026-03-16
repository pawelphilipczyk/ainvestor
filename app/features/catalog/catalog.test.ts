import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { resetEtfEntries } from '../portfolio/index.ts'
import { resetGuestCatalog } from './index.ts'

afterEach(() => {
	resetEtfEntries()
	resetGuestCatalog()
})

describe('ETF Catalog page', () => {
	it('GET /catalog returns 200 with page title', async () => {
		const response = await router.fetch('http://localhost/catalog')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /ETF Catalog/)
	})

	it('GET /catalog shows CSV import form', async () => {
		const response = await router.fetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /name="csvFile"/)
		assert.match(body, /action="\/catalog\/import"/)
		assert.match(body, /enctype="multipart\/form-data"/)
	})

	it('GET /catalog shows empty state hint when no catalog imported', async () => {
		const response = await router.fetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /No catalog imported yet/)
	})

	it('GET /catalog renders theme toggle as a real button element, not escaped HTML text', async () => {
		const response = await router.fetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /<button[^>]*data-island="components\/theme-toggle"/)
		assert.doesNotMatch(body, /&lt;button/)
	})

	it('GET /catalog has a link back to the portfolio', async () => {
		const response = await router.fetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /href="\/"/)
		assert.match(body, /Portfolio/)
	})

	it('POST /catalog/import with a CSV file stores catalog and redirects', async () => {
		const csv =
			'ticker,name,type,description\nVTI,Vanguard Total,equity,US broad market\nBND,Vanguard Bond,bond,US bonds'
		const file = new File([csv], 'etfs.csv', { type: 'text/csv' })
		const form = new FormData()
		form.set('csvFile', file)

		const importResponse = await router.fetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(importResponse.status, 302)
		assert.equal(importResponse.headers.get('location'), '/catalog')

		const catalogResponse = await router.fetch('http://localhost/catalog')
		const body = await catalogResponse.text()

		assert.match(body, /VTI/)
		assert.match(body, /Vanguard Total/)
		assert.match(body, /BND/)
		assert.match(body, /Vanguard Bond/)
	})

	it('POST /catalog/import with empty CSV redirects without error', async () => {
		const file = new File([''], 'empty.csv', { type: 'text/csv' })
		const form = new FormData()
		form.set('csvFile', file)

		const response = await router.fetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: form,
			}),
		)

		assert.equal(response.status, 302)
		assert.equal(response.headers.get('location'), '/catalog')
	})

	it('catalog shows Your Holdings section when a holding matches a catalog ticker', async () => {
		const csv =
			'ticker,name,type,description\nVTI,Vanguard Total,equity,US broad market'
		const file = new File([csv], 'etfs.csv', { type: 'text/csv' })
		const importForm = new FormData()
		importForm.set('csvFile', file)
		await router.fetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: importForm,
			}),
		)

		const addForm = new FormData()
		addForm.set('etfName', 'VTI')
		addForm.set('value', '5000')
		addForm.set('currency', 'USD')
		await router.fetch(
			new Request('http://localhost/etfs', { method: 'POST', body: addForm }),
		)

		const response = await router.fetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /Your Holdings/)
		assert.match(body, /5[,.]?000/)
	})

	it('catalog page shows type filter and search form after import', async () => {
		const csv = 'ticker,name,type\nVTI,Vanguard Total,equity'
		const file = new File([csv], 'etfs.csv', { type: 'text/csv' })
		const form = new FormData()
		form.set('csvFile', file)
		await router.fetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: form,
			}),
		)

		const response = await router.fetch('http://localhost/catalog')
		const body = await response.text()

		assert.match(body, /name="q"/)
		assert.match(body, /name="type"/)
	})

	it('catalog type filter narrows results', async () => {
		const csv =
			'ticker,name,type\nVTI,Vanguard Total,equity\nBND,Vanguard Bond,bond'
		const file = new File([csv], 'etfs.csv', { type: 'text/csv' })
		const form = new FormData()
		form.set('csvFile', file)
		await router.fetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: form,
			}),
		)

		const response = await router.fetch('http://localhost/catalog?type=bond')
		const body = await response.text()

		assert.match(body, /BND/)
		assert.doesNotMatch(body, /VTI/)
	})

	it('catalog text search narrows results', async () => {
		const csv =
			'ticker,name,type,description\nVTI,Vanguard Total,equity,US market\nBND,Vanguard Bond,bond,US bonds'
		const file = new File([csv], 'etfs.csv', { type: 'text/csv' })
		const form = new FormData()
		form.set('csvFile', file)
		await router.fetch(
			new Request('http://localhost/catalog/import', {
				method: 'POST',
				body: form,
			}),
		)

		const response = await router.fetch('http://localhost/catalog?q=bond')
		const body = await response.text()

		assert.match(body, /BND/)
		assert.doesNotMatch(body, /VTI/)
	})
})
