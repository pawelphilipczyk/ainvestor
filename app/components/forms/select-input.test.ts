import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import { SelectInput } from './select-input.tsx'

describe('SelectInput', () => {
	it('renders a native select with name, id, and options', async () => {
		const html = await renderToString(
			jsx(SelectInput, {
				id: 'kind',
				name: 'kind',
				options: [
					{ value: 'a', label: 'Alpha' },
					{ value: 'b', label: 'Beta', selected: true },
				],
			}),
		)
		assert.match(html, /<select[^>]*\bid="kind"/)
		assert.match(html, /\bname="kind"/)
		assert.match(html, /<option[^>]*\bvalue="a"/)
		assert.match(html, />Alpha</)
		assert.match(html, /<option[^>]*\bvalue="b"[^>]*\bselected/)
		assert.match(html, />Beta</)
	})

	it('omits per-option selected when the select is controlled by value', async () => {
		const html = await renderToString(
			jsx(SelectInput, {
				id: 'x',
				name: 'x',
				value: 'b',
				options: [
					{ value: 'a', label: 'A', selected: false },
					{ value: 'b', label: 'B', selected: false },
				],
			}),
		)
		assert.match(html, /\bvalue="b"/)
		assert.doesNotMatch(html, /<option[^>]*\bselected/)
	})

	it('applies compact height classes when compact is true', async () => {
		const html = await renderToString(
			jsx(SelectInput, {
				id: 'c',
				name: 'c',
				compact: true,
				options: [{ value: '1', label: 'One' }],
			}),
		)
		assert.match(html, /\bh-9\b/)
		assert.match(html, /\bmin-h-9\b/)
	})

	it('renders disabled and required on the select', async () => {
		const html = await renderToString(
			jsx(SelectInput, {
				id: 'd',
				name: 'd',
				disabled: true,
				required: true,
				options: [{ value: '1', label: 'One' }],
			}),
		)
		assert.match(html, /\bdisabled/)
		assert.match(html, /\brequired/)
	})
})
