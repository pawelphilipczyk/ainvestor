import * as assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { router } from '../router.ts'
import { routes } from '../routes.ts'
import { Sidebar } from './sidebar.tsx'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

const NAV_LINKS = [
	{
		href: routes.portfolio.index.href(),
		label: 'Portfolio',
		page: 'portfolio' as const,
	},
	{
		href: routes.catalog.index.href(),
		label: 'ETF Catalog',
		page: 'catalog' as const,
	},
	{
		href: routes.guidelines.index.href(),
		label: 'Investment Guidelines',
		page: 'guidelines' as const,
	},
]

describe('sidebar component', () => {
	it('sidebar.tsx exists in app/components/', () => {
		const filePath = join(componentsDir, 'sidebar.tsx')
		assert.ok(existsSync(filePath), 'sidebar.tsx must exist')
	})

	it('Sidebar renders with nav links', async () => {
		const result = await renderToString(
			jsx(Sidebar, {
				navLinks: NAV_LINKS,
				currentPage: 'portfolio',
				session: null,
			}),
		)
		assert.match(result, /id="app-sidebar"/)
		assert.match(result, /id="sidebar-backdrop"/)
		assert.match(result, /href="\/catalog"/)
		assert.match(result, /href="\/guidelines"/)
	})

	it('Sidebar marks the current page with aria-current="page"', async () => {
		const result = await renderToString(
			jsx(Sidebar, {
				navLinks: NAV_LINKS,
				currentPage: 'catalog',
				session: null,
			}),
		)
		assert.match(result, /aria-current="page"/)
	})

	it('Sidebar shows sign-in link when session is null', async () => {
		const result = await renderToString(
			jsx(Sidebar, {
				navLinks: NAV_LINKS,
				currentPage: 'portfolio',
				session: null,
			}),
		)
		assert.match(result, /Sign in with GitHub/)
	})

	it('Sidebar shows sign-out form when session is provided', async () => {
		const result = await renderToString(
			jsx(Sidebar, {
				navLinks: NAV_LINKS,
				currentPage: 'portfolio',
				session: { login: 'alice', token: 'tok', gistId: null },
			}),
		)
		assert.match(result, /Sign out/)
		assert.match(result, /@alice/)
	})
})

describe('remix component runtime in document', () => {
	it('body no longer uses legacy data-island activation attributes', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.doesNotMatch(body, /data-island=/)
	})

	it('document includes import map for remix component runtime', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /"remix\/component":\s*"\/remix\/dist\/component\.js"/)
		assert.match(
			body,
			/"@remix-run\/component":\s*"\/@remix-run\/component\/dist\/index\.js"/,
		)
	})

	it('document boots remix component runtime with run(document, ...)', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /import \{ run \} from 'remix\/component'/)
		assert.match(body, /run\(document, \{/)
		assert.match(body, /loadModule\(moduleUrl, exportName\)/)
	})
})

describe('sidebar component entry static file', () => {
	it('GET /components/sidebar.component.js returns 200 with javascript content-type', async () => {
		const response = await router.fetch(
			'http://localhost/components/sidebar.component.js',
		)
		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('GET /components/sidebar.island.js returns 404 after migration', async () => {
		const response = await router.fetch(
			'http://localhost/components/sidebar.island.js',
		)
		assert.equal(response.status, 404)
	})

	it('sidebar component entry uses remix component + interaction APIs', async () => {
		const response = await router.fetch(
			'http://localhost/components/sidebar.component.js',
		)
		const body = await response.text()
		assert.match(body, /clientEntry/)
		assert.match(body, /from 'remix\/component'/)
		assert.match(body, /from 'remix\/interaction'/)
		assert.match(body, /ownerDocument/)
		assert.match(body, /on\(doc,/)
	})
})
