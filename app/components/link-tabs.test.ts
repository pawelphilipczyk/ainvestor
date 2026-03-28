import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { LinkTabs } from './link-tabs.tsx'

describe('LinkTabs', () => {
	it('renders links and aria-current on the active tab', async () => {
		const html = await renderToString(
			jsx(LinkTabs, {
				navAriaLabel: 'Sections',
				activeId: 'b',
				tabs: [
					{ id: 'a', href: '/x?tab=a', label: 'First' },
					{ id: 'b', href: '/x?tab=b', label: 'Second' },
				],
			}),
		)
		assert.match(html, /aria-label="Sections"/)
		assert.match(html, /href="\/x\?tab=a"/)
		assert.match(html, /href="\/x\?tab=b"/)
		assert.match(html, /aria-current="page"/)
		assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1)
		assert.match(html, />Second</)
	})
})
