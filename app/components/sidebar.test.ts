import * as assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { appSidebar } from '../features/shared/index.ts'
import { router } from '../router.ts'
import { renderComponent } from './render.ts'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

describe('sidebar component', () => {
	it('sidebar.html exists in app/components/', () => {
		const filePath = join(componentsDir, 'sidebar.html')
		assert.ok(existsSync(filePath), 'sidebar.html must exist')
	})

	it('sidebar.html contains the sidebar structure with placeholders', () => {
		const filePath = join(componentsDir, 'sidebar.html')
		const template = readFileSync(filePath, 'utf-8')
		assert.match(template, /id="app-sidebar"/)
		assert.match(template, /id="sidebar-backdrop"/)
		assert.match(template, /\{\{ nav_items \}\}/)
		assert.match(template, /\{\{ auth_action \}\}/)
	})

	it('renderComponent("sidebar") fills nav_items and auth_action placeholders', () => {
		const result = String(
			renderComponent('sidebar', {
				nav_items: '<a href="/test">Test</a>',
				auth_action: '<a href="/login">Sign in</a>',
			}),
		)
		assert.match(result, /href="\/test"/)
		assert.match(result, /href="\/login"/)
		assert.doesNotMatch(result, /\{\{ nav_items \}\}/)
		assert.doesNotMatch(result, /\{\{ auth_action \}\}/)
	})

	it('appSidebar() renders sidebar with nav links', () => {
		const result = String(appSidebar(null, 'portfolio'))
		assert.match(result, /id="app-sidebar"/)
		assert.match(result, /id="sidebar-backdrop"/)
		assert.match(result, /href="\/guidelines"/)
	})

	it('appSidebar() marks the current page with aria-current="page"', () => {
		const result = String(appSidebar(null, 'guidelines'))
		assert.match(result, /aria-current="page"/)
	})

	it('appSidebar() shows sign-in link when session is null', () => {
		const result = String(appSidebar(null, 'portfolio'))
		assert.match(result, /Sign in with GitHub/)
	})

	it('appSidebar() shows sign-out form when session is provided', () => {
		const result = String(
			appSidebar({ login: 'alice', token: 'tok', gistId: null }, 'portfolio'),
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
