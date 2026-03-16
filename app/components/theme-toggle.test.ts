import * as assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { router } from '../router.ts'
import { themeToggleButton } from '../features/shared/index.ts'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

describe('theme-toggle component', () => {
	it('theme-toggle.html exists in app/components/', () => {
		const filePath = join(componentsDir, 'theme-toggle.html')
		assert.ok(existsSync(filePath), 'theme-toggle.html must exist')
	})

	it('theme-toggle.html contains the data-island attribute', () => {
		const filePath = join(componentsDir, 'theme-toggle.html')
		const template = readFileSync(filePath, 'utf-8')
		assert.match(template, /data-island="theme-toggle"/)
	})

	it('theme-toggle.html contains sun and moon SVG icons', () => {
		const filePath = join(componentsDir, 'theme-toggle.html')
		const template = readFileSync(filePath, 'utf-8')
		assert.match(template, /dark:-rotate-90/, 'sun icon with dark variant')
		assert.match(template, /dark:rotate-0/, 'moon icon with dark variant')
	})

	it('themeToggleButton() renders output from theme-toggle.html (no inline HTML duplication)', () => {
		const result = String(themeToggleButton())
		assert.match(result, /data-island="theme-toggle"/)
		assert.match(result, /<button/)
	})
})

describe('theme-toggle island static file', () => {
	it('GET /islands/theme-toggle.js returns 200 with javascript content-type', async () => {
		const response = await router.fetch('http://localhost/islands/theme-toggle.js')
		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})
})
