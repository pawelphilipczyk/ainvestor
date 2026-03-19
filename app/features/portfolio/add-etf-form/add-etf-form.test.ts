import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { object, optional, parseSafe, string } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'

const CreateEtfSchema = object({
	etfName: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
	exchange: optional(string()),
	quantity: optional(coerce.number().pipe(min(0))),
})

describe('CreateEtfSchema with optional field preprocessing', () => {
	it('accepts empty exchange and quantity when normalized to absent', () => {
		const raw: Record<string, unknown> = {
			etfName: 'VTI',
			value: '1000',
			currency: 'PLN',
			exchange: '',
			quantity: '',
		}
		if (raw.exchange === '') delete raw.exchange
		if (raw.quantity === '') delete raw.quantity

		const result = parseSafe(CreateEtfSchema, raw)
		assert.equal(result.success, true, JSON.stringify(result))
		if (result.success) {
			assert.equal(result.value.exchange, undefined)
			assert.equal(result.value.quantity, undefined)
		}
	})
})
