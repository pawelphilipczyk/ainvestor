import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { TabLink, TabsNav } from './tabs-nav.tsx'

describe('TabsNav', () => {
	it('throws when TabLink is rendered outside TabsNav', async () => {
		await assert.rejects(
			renderToString(
				jsx(TabLink, { id: 'orphan', href: '/', children: 'Alone' }),
			),
			(err: unknown) =>
				err instanceof Error &&
				err.message === 'TabLink must be used inside TabsNav',
		)
	})

	it('passes nav props through and sets aria-current on the active TabLink', async () => {
		const html = await renderToString(
			jsx(TabsNav, {
				activeId: 'b',
				'aria-label': 'Sections',
				children: [
					jsx(TabLink, { id: 'a', href: '/x?tab=a', children: 'First' }),
					jsx(TabLink, { id: 'b', href: '/x?tab=b', children: 'Second' }),
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
