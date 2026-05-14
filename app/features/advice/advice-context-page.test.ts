import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import { AdviceContextPage } from './advice-context-page.tsx'

describe('AdviceContextPage', () => {
	it('renders the page heading', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
			}),
		)
		assert.match(html, /Export context/)
	})

	it('renders a textarea with data-llm-export-markdown and the given markdown content', async () => {
		const md = '# Portfolio\n- VTI: 60%\n'
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: md,
				catalogJson: '[]',
			}),
		)
		assert.match(html, /data-llm-export-markdown/)
		assert.match(html, /# Portfolio/)
	})

	it('renders a textarea with data-llm-export-catalog-json and the given catalogJson content', async () => {
		const json = '[{"ticker":"VTI"}]'
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: json,
			}),
		)
		assert.match(html, /data-llm-export-catalog-json/)
		assert.match(html, /\{"ticker":"VTI"\}/)
	})

	it('renders Copy Markdown button with data-copy-llm-markdown', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
			}),
		)
		assert.match(html, /data-copy-llm-markdown/)
		assert.match(html, /Copy Markdown/)
	})

	it('renders Copy catalog JSON button with data-copy-llm-catalog-json', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
			}),
		)
		assert.match(html, /data-copy-llm-catalog-json/)
		assert.match(html, /Copy catalog JSON/)
	})

	it('renders Copy Markdown + JSON button with data-copy-llm-both', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
			}),
		)
		assert.match(html, /data-copy-llm-both/)
		assert.match(html, /Copy Markdown \+ JSON/)
	})

	it('renders data-llm-export-root container wrapping the textareas', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: 'md',
				catalogJson: '[]',
			}),
		)
		assert.match(html, /data-llm-export-root/)
	})

	it('shows snapshot error alert when snapshotError is true', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
				snapshotError: true,
			}),
		)
		assert.match(html, /role="alert"/)
		assert.match(html, /Could not load your saved portfolio/)
	})

	it('does not render snapshot error alert when snapshotError is undefined', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
			}),
		)
		assert.doesNotMatch(html, /role="alert"/)
		assert.doesNotMatch(html, /Could not load your saved portfolio/)
	})

	it('does not render snapshot error alert when snapshotError is false', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
				snapshotError: false,
			}),
		)
		assert.doesNotMatch(html, /role="alert"/)
	})

	it('renders a back-to-advice link', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
			}),
		)
		assert.match(html, /href="\/advice"/)
		assert.match(html, /Back to Get Advice/)
	})

	it('renders privacy note text', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
			}),
		)
		assert.match(html, /This page contains financial data/)
	})

	it('renders both textarea labels', async () => {
		const html = await renderToString(
			jsx(AdviceContextPage, {
				markdown: '',
				catalogJson: '[]',
			}),
		)
		assert.match(html, /Markdown \(portfolio and guidelines\)/)
		assert.match(html, /ETF catalog \(JSON array\)/)
	})
})