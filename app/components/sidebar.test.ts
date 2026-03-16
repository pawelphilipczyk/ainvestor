import * as assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { router } from '../router.ts'
import { appSidebar } from '../features/shared/index.ts'
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
		const result = String(renderComponent('sidebar', {
			nav_items: '<a href="/test">Test</a>',
			auth_action: '<a href="/login">Sign in</a>',
		}))
		assert.match(result, /href="\/test"/)
		assert.match(result, /href="\/login"/)
		assert.doesNotMatch(result, /\{\{ nav_items \}\}/)
		assert.doesNotMatch(result, /\{\{ auth_action \}\}/)
	})

	it('appSidebar() renders sidebar with nav links', () => {
		const result = String(appSidebar(null, 'portfolio'))
		assert.match(result, /id="app-sidebar"/)
		assert.match(result, /id="sidebar-backdrop"/)
		assert.match(result, /href="\/catalog"/)
		assert.match(result, /href="\/guidelines"/)
	})

	it('appSidebar() marks the current page with aria-current="page"', () => {
		const result = String(appSidebar(null, 'catalog'))
		assert.match(result, /aria-current="page"/)
	})

	it('appSidebar() shows sign-in link when session is null', () => {
		const result = String(appSidebar(null, 'portfolio'))
		assert.match(result, /Sign in with GitHub/)
	})

	it('appSidebar() shows sign-out form when session is provided', () => {
		const result = String(appSidebar({ login: 'alice', token: 'tok' }, 'portfolio'))
		assert.match(result, /Sign out/)
		assert.match(result, /@alice/)
	})
})

describe('island loader in page shell', () => {
	it('body element carries data-island="components/sidebar" so the loader activates it', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /<body[^>]*data-island="components\/sidebar"/)
	})

	it('page shell island loader script loads islands via /<name>.island.js', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /data-island/)
		assert.match(body, /\.island\.js/)
	})

	it('page shell does not contain inline sidebar or theme-toggle logic', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.doesNotMatch(body, /openSidebar/)
		assert.doesNotMatch(body, /closeSidebar/)
		assert.doesNotMatch(body, /localStorage\.setItem\('theme'/)
	})
})

describe('sidebar island static file', () => {
	it('GET /components/sidebar.island.js returns 200 with javascript content-type', async () => {
		const response = await router.fetch('http://localhost/components/sidebar.island.js')
		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('GET /components/sidebar.island.ts returns 404 (TypeScript source not exposed)', async () => {
		const response = await router.fetch('http://localhost/components/sidebar.island.ts')
		assert.equal(response.status, 404)
	})
})
