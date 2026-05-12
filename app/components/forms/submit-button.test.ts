import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import { SubmitButton } from './submit-button.tsx'

describe('SubmitButton', () => {
	it('renders type submit with busy overlay markup for setSubmitButtonLoading', async () => {
		const html = await renderToString(jsx(SubmitButton, { children: 'Save' }))
		assert.match(html, /<button[^>]*\btype="submit"/)
		assert.match(html, /submit-button-busy-overlay/)
		assert.match(html, /busy-control-label/)
		assert.match(html, />Save</)
	})

	it('applies compact height classes when compact is true', async () => {
		const html = await renderToString(
			jsx(SubmitButton, { children: 'Filter', compact: true }),
		)
		assert.match(html, /\bh-9\b/)
		assert.match(html, /\bmin-h-9\b/)
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
