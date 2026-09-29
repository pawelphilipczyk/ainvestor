import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import { NumberInput } from './number-input.tsx'

describe('NumberInput', () => {
	it('renders a plain type="number" field with min 0 and step any when no inputMode is set', async () => {
		const html = await renderToString(jsx(NumberInput, { name: 'amount' }))
		assert.match(html, /\btype="number"/)
		assert.match(html, /\bmin="0"/)
		assert.match(html, /\bstep="any"/)
		assert.doesNotMatch(html, /\binputmode=/)
		assert.doesNotMatch(html, /\bpattern=/)
	})

	it('falls back to the decimal pattern when inputMode is decimal and pattern is omitted or blank', async () => {
		for (const pattern of [undefined, '  ']) {
			const html = await renderToString(
				jsx(NumberInput, { name: 'amount', inputMode: 'decimal', pattern }),
			)
			assert.match(html, /\btype="text"/)
			assert.match(html, /\binputmode="decimal"/)
			assert.match(html, /\bpattern="\(\?=\.\*\\d\)\[\\d\\s\.,\]\+"/)
		}
	})

	it('falls back to the digits-only pattern when inputMode is numeric and pattern is omitted', async () => {
		const html = await renderToString(
			jsx(NumberInput, { name: 'count', inputMode: 'numeric' }),
		)
		assert.match(html, /\btype="text"/)
		assert.match(html, /\binputmode="numeric"/)
		assert.match(html, /\bpattern="\[0-9\]\*"/)
	})

	it('keeps an explicit pattern instead of the inputMode fallback', async () => {
		const html = await renderToString(
			jsx(NumberInput, {
				name: 'amount',
				inputMode: 'decimal',
				pattern: '[0-9]+',
			}),
		)
		assert.match(html, /\bpattern="\[0-9\]\+"/)
		assert.doesNotMatch(html, /\(\?=/)
	})
})
