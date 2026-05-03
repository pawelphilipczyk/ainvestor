import assert from 'node:assert/strict'
import test from 'node:test'
import { extractBankApiJsonFromHar } from './har-bank-json-adapter.ts'

function minimalHarEntry(offset: number, rows: unknown[]) {
	const url = `https://example.test/api/equities/widgets/etf-screener-v3?offset=${offset}&limit=10`
	return {
		request: { method: 'GET', url },
		response: {
			status: 200,
			content: {
				mimeType: 'application/json',
				text: JSON.stringify({
					data: rows,
					count: rows.length,
					total_count: rows.length,
				}),
			},
		},
	}
}

test('extractBankApiJsonFromHar merges paginated etf-screener responses by offset', () => {
	const har = {
		log: {
			version: '1.2',
			entries: [
				minimalHarEntry(10, [
					{ ticker: 'B', fund_name: 'Beta', isin: 'IE0000000002' },
				]),
				minimalHarEntry(0, [
					{ ticker: 'A', fund_name: 'Alpha', isin: 'IE0000000001' },
				]),
			],
		},
	}

	const result = extractBankApiJsonFromHar(har)
	assert.equal(result.ok, true)
	if (!result.ok) return
	const payload = result.payload as { data: unknown[] }
	assert.equal(payload.data.length, 2)
	assert.equal((payload.data[0] as { ticker: string }).ticker, 'A')
	assert.equal((payload.data[1] as { ticker: string }).ticker, 'B')
})

test('extractBankApiJsonFromHar rejects HAR without screener entries', () => {
	const har = {
		log: {
			entries: [
				{
					request: { url: 'https://example.test/other' },
					response: {
						status: 200,
						content: { text: '{}' },
					},
				},
			],
		},
	}
	assert.equal(extractBankApiJsonFromHar(har).ok, false)
})
