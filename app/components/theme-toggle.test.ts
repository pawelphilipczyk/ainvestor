import * as assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { themeToggleButton } from '../features/shared/index.ts'
import { router } from '../router.ts'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

describe('theme-toggle component', () => {
	it('theme-toggle.html exists in app/components/', () => {
		const filePath = join(componentsDir, 'theme-toggle.html')
		assert.ok(existsSync(filePath), 'theme-toggle.html must exist')
	})

	it('theme-toggle.html contains the data-theme-toggle hook attribute', () => {
		const filePath = join(componentsDir, 'theme-toggle.html')
		const template = readFileSync(filePath, 'utf-8')
		assert.match(template, /data-theme-toggle/)
	})

	it('theme-toggle.html contains sun and moon SVG icons', () => {
		const filePath = join(componentsDir, 'theme-toggle.html')
		const template = readFileSync(filePath, 'utf-8')
		assert.match(template, /dark:-rotate-90/, 'sun icon with dark variant')
		assert.match(template, /dark:rotate-0/, 'moon icon with dark variant')
	})

	it('themeToggleButton() renders output from theme-toggle.html (no inline HTML duplication)', () => {
		const result = String(themeToggleButton())
		assert.match(result, /data-theme-toggle/)
		assert.match(result, /<button/)
	})
})

describe('theme-toggle component entry static file', () => {
	it('GET /components/theme-toggle.component.js returns 200 with javascript content-type', async () => {
		const response = await router.fetch(
			'http://localhost/components/theme-toggle.component.js',
		)
		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('GET /components/theme-toggle.island.js returns 404 after migration', async () => {
		const response = await router.fetch(
			'http://localhost/components/theme-toggle.island.js',
		)
		assert.equal(response.status, 404)
	})

	it('theme-toggle component entry uses remix component + interaction APIs', async () => {
		const response = await router.fetch(
			'http://localhost/components/theme-toggle.component.js',
		)
		const body = await response.text()
		assert.match(body, /clientEntry/)
		assert.match(body, /from 'remix\/component'/)
		assert.match(body, /from 'remix\/interaction'/)
		assert.match(body, /on\(document,/)
	})
})
