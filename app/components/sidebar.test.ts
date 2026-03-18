import * as assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { router } from '../router.ts'
import { appSidebar } from './page-shell.ts'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

describe('sidebar component', () => {
	it('sidebar.tsx exists in app/components/', () => {
		const filePath = join(componentsDir, 'sidebar.tsx')
		assert.ok(existsSync(filePath), 'sidebar.tsx must exist')
	})

	it('appSidebar() renders sidebar with nav links', async () => {
		const result = String(await appSidebar(null, 'portfolio'))
		assert.match(result, /id="app-sidebar"/)
		assert.match(result, /id="sidebar-backdrop"/)
		assert.match(result, /href="\/catalog"/)
		assert.match(result, /href="\/guidelines"/)
	})

	it('appSidebar() marks the current page with aria-current="page"', async () => {
		const result = String(await appSidebar(null, 'catalog'))
		assert.match(result, /aria-current="page"/)
	})

	it('appSidebar() shows sign-in link when session is null', async () => {
		const result = String(await appSidebar(null, 'portfolio'))
		assert.match(result, /Sign in with GitHub/)
	})

	it('appSidebar() shows sign-out form when session is provided', async () => {
		const result = String(
			await appSidebar(
				{ login: 'alice', token: 'tok', gistId: null },
				'portfolio',
			),
		)
		assert.match(result, /Sign out/)
		assert.match(result, /@alice/)
	})
})

describe('remix component runtime in page shell', () => {
	it('body no longer uses legacy data-island activation attributes', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.doesNotMatch(body, /data-island=/)
	})

	it('page shell includes import map for remix component runtime', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /"remix\/component": "\/remix\/dist\/component\.js"/)
		assert.match(
			body,
			/"@remix-run\/component": "\/@remix-run\/component\/dist\/index\.js"/,
		)
	})

	it('page shell boots remix component runtime with run(document, ...)', async () => {
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
