import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSafe } from 'remix/data-schema'
import { CreateEtfSchema, normalizeAddEtfInput } from './index.ts'

describe('CreateEtfSchema with optional field preprocessing', () => {
	it('accepts empty exchange and quantity when normalized to absent', () => {
		const raw: Record<string, unknown> = {
			instrumentTicker: 'VTI',
			value: '1000',
			currency: 'PLN',
			exchange: '',
			quantity: '',
		}
		normalizeAddEtfInput(raw)

		const result = parseSafe(CreateEtfSchema, raw)
		assert.equal(result.success, true, JSON.stringify(result))
		if (result.success) {
			assert.equal(result.value.exchange, undefined)
			assert.equal(result.value.quantity, undefined)
		}
	})
})
