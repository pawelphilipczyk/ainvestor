import * as assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { themeToggleButton } from '../features/shared/index.ts'
import { router } from '../router.ts'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

describe('theme-toggle component', () => {
	it('theme-toggle.tsx exists in app/components/', () => {
		const filePath = join(componentsDir, 'theme-toggle.tsx')
		assert.ok(existsSync(filePath), 'theme-toggle.tsx must exist')
	})

	it('themeToggleButton() renders output with data-theme-toggle and button (JSX)', async () => {
		const result = String(await themeToggleButton())
		assert.match(result, /data-theme-toggle/)
		assert.match(result, /<button/)
	})

	it('themeToggleButton() renders sun and moon SVG icons', async () => {
		const result = String(await themeToggleButton())
		assert.match(result, /dark:-rotate-90/, 'sun icon with dark variant')
		assert.match(result, /dark:rotate-0/, 'moon icon with dark variant')
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
		assert.match(body, /ownerDocument/)
		assert.match(body, /on\(doc,/)
	})
})
