import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { EtfEntry } from './gist.ts'
import {
	totalHoldingsValueForShareBars,
	valueShareOfHoldingsTotalPercent,
} from './portfolio-holdings-share.ts'

describe('totalHoldingsValueForShareBars', () => {
	it('returns null for empty list', () => {
		assert.equal(totalHoldingsValueForShareBars([]), null)
	})

	it('sums values for a single currency', () => {
		const entries: EtfEntry[] = [
			{ id: '1', name: 'A', value: 40, currency: 'USD' },
			{ id: '2', name: 'B', value: 60, currency: 'USD' },
		]
		assert.equal(totalHoldingsValueForShareBars(entries), 100)
	})

	it('returns null when currencies differ', () => {
		const entries: EtfEntry[] = [
			{ id: '1', name: 'A', value: 40, currency: 'USD' },
			{ id: '2', name: 'B', value: 60, currency: 'PLN' },
		]
		assert.equal(totalHoldingsValueForShareBars(entries), null)
	})

	it('treats non-finite values as zero in the sum', () => {
		const entries: EtfEntry[] = [
			{ id: '1', name: 'A', value: Number.NaN, currency: 'USD' },
			{ id: '2', name: 'B', value: 50, currency: 'USD' },
		]
		assert.equal(totalHoldingsValueForShareBars(entries), 50)
	})
})

describe('valueShareOfHoldingsTotalPercent', () => {
	it('returns 0 when total is not positive', () => {
		assert.equal(valueShareOfHoldingsTotalPercent({ value: 10, total: 0 }), 0)
		assert.equal(valueShareOfHoldingsTotalPercent({ value: 10, total: -1 }), 0)
	})

	it('computes share and clamps to 0–100', () => {
		assert.equal(
			valueShareOfHoldingsTotalPercent({ value: 25, total: 100 }),
			25,
		)
		assert.equal(
			valueShareOfHoldingsTotalPercent({ value: 1, total: 3 }),
			100 / 3,
		)
	})
})
