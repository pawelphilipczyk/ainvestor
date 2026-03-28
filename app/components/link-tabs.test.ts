import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { LinkTab, LinkTabs } from './link-tabs.tsx'

describe('LinkTabs', () => {
	it('renders LinkTab children with aria-current on the active tab', async () => {
		const html = await renderToString(
			jsx(LinkTabs, {
				navAriaLabel: 'Sections',
				activeId: 'b',
				children: [
					jsx(LinkTab, { id: 'a', href: '/x?tab=a', children: 'First' }),
					jsx(LinkTab, { id: 'b', href: '/x?tab=b', children: 'Second' }),
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
