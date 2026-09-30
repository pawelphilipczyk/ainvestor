import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import {
	formControlHeightCompact,
	formControlHeightDefault,
} from './form-control-classes.ts'
import { SelectInput } from './select-input.tsx'

function hasClassTokens(html: string, classes: string): boolean {
	return classes
		.split(' ')
		.every((token) => new RegExp(`\\b${token}\\b`).test(html))
}

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

	it('marks the option matching value as selected, ignoring per-option selected flags', async () => {
		const html = await renderToString(
			jsx(SelectInput, {
				id: 'x',
				name: 'x',
				value: 'b',
				options: [
					{ value: 'a', label: 'A', selected: true },
					{ value: 'b', label: 'B', selected: false },
				],
			}),
		)
		assert.match(html, /\bvalue="b"/)
		assert.match(html, /<option[^>]*\bvalue="b"[^>]*\bselected/)
		assert.doesNotMatch(html, /<option[^>]*\bvalue="a"[^>]*\bselected/)
	})

	it('switches from the default to the compact height tier when compact is true', async () => {
		const defaultHtml = await renderToString(
			jsx(SelectInput, {
				id: 'c',
				name: 'c',
				options: [{ value: '1', label: 'One' }],
			}),
		)
		const compactHtml = await renderToString(
			jsx(SelectInput, {
				id: 'c',
				name: 'c',
				compact: true,
				options: [{ value: '1', label: 'One' }],
			}),
		)
		assert.ok(hasClassTokens(defaultHtml, formControlHeightDefault))
		assert.ok(!hasClassTokens(defaultHtml, formControlHeightCompact))
		assert.ok(hasClassTokens(compactHtml, formControlHeightCompact))
		assert.ok(!hasClassTokens(compactHtml, formControlHeightDefault))
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
