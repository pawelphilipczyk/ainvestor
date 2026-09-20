import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import {
	formControlHeightCompact,
	formControlHeightDefault,
} from './form-control-classes.ts'
import { SubmitButton } from './submit-button.tsx'

function hasClassTokens(html: string, classes: string): boolean {
	return classes
		.split(' ')
		.every((token) => new RegExp(`\\b${token}\\b`).test(html))
}

describe('SubmitButton', () => {
	it('renders type submit with busy overlay markup for setSubmitButtonLoading', async () => {
		const html = await renderToString(jsx(SubmitButton, { children: 'Save' }))
		assert.match(html, /<button[^>]*\btype="submit"/)
		assert.match(html, /submit-button-busy-overlay/)
		assert.match(html, /busy-control-label/)
		assert.match(html, />Save</)
	})

	it('switches from the default to the compact height tier when compact is true', async () => {
		const defaultHtml = await renderToString(
			jsx(SubmitButton, { children: 'Filter' }),
		)
		const compactHtml = await renderToString(
			jsx(SubmitButton, { children: 'Filter', compact: true }),
		)
		assert.ok(hasClassTokens(defaultHtml, formControlHeightDefault))
		assert.ok(!hasClassTokens(defaultHtml, formControlHeightCompact))
		assert.ok(hasClassTokens(compactHtml, formControlHeightCompact))
		assert.ok(!hasClassTokens(compactHtml, formControlHeightDefault))
	})

	it('passes name and value for multi-submit forms', async () => {
		const html = await renderToString(
			jsx(SubmitButton, {
				children: 'Send',
				name: 'intent',
				value: 'buy',
			}),
		)
		assert.match(html, /\bname="intent"/)
		assert.match(html, /\bvalue="buy"/)
	})
})
