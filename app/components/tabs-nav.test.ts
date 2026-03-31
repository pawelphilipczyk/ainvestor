import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { router } from '../router.ts'
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

	it('sets data-tab-scroll-group on nav and data-tab-scroll-key on TabLinks when scrollGroupId is set', async () => {
		const html = await renderToString(
			jsx(TabsNav, {
				activeId: 'a',
				scrollGroupId: 'test-group',
				children: [
					jsx(TabLink, { id: 'a', href: '/x', children: 'First' }),
					jsx(TabLink, { id: 'b', href: '/y', children: 'Second' }),
				],
			}),
		)
		assert.match(html, /data-tab-scroll-group="test-group"/)
		assert.match(html, /data-tab-scroll-key="a"/)
		assert.match(html, /data-tab-scroll-key="b"/)
	})
})

describe('tabs-nav scroll restoration component entry', () => {
	it('GET /components/tabs-nav-scroll.component.js returns 200 with javascript content-type', async () => {
		const response = await router.fetch(
			'http://localhost/components/tabs-nav-scroll.component.js',
		)
		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('tabs-nav-scroll component entry uses remix component + interaction APIs', async () => {
		const response = await router.fetch(
			'http://localhost/components/tabs-nav-scroll.component.js',
		)
		const body = await response.text()
		assert.match(body, /clientEntry/)
		assert.match(body, /from 'remix\/component'/)
		assert.match(body, /from '@remix-run\/interaction'/)
		assert.match(body, /sessionStorage/)
	})
})
