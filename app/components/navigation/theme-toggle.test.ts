import * as assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import { router } from '../../router.ts'
import { ThemeToggle } from './theme-toggle.component.js'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

function renderThemeToggle() {
	return renderToString(jsx(ThemeToggle, { label: 'Toggle theme' }))
}

describe('theme-toggle component', () => {
	it('theme-toggle.component.js exists in app/components/navigation/', () => {
		const filePath = join(componentsDir, 'theme-toggle.component.js')
		assert.ok(existsSync(filePath), 'theme-toggle.component.js must exist')
	})

	it('ThemeToggle renders output with data-theme-toggle and button (JSX)', async () => {
		const result = await renderThemeToggle()
		assert.match(result, /data-theme-toggle/)
		assert.match(result, /<button/)
	})

	it('ThemeToggle renders sun and moon SVG icons', async () => {
		const result = await renderThemeToggle()
		assert.match(result, /dark:-rotate-90/, 'sun icon with dark variant')
		assert.match(result, /dark:rotate-0/, 'moon icon with dark variant')
	})

	it('ThemeToggle renders the switch contract from toggle.control', async () => {
		const result = await renderThemeToggle()
		assert.match(result, /role="switch"/)
		// Dark is the server-rendered default (`<html class="dark">`).
		assert.match(result, /data-state="checked"/)
		assert.match(result, /aria-label="Toggle theme"/)
	})

	it('ThemeToggle server-renders as a hydratable client entry', async () => {
		const result = await renderThemeToggle()
		assert.match(
			result,
			/"moduleUrl":"\/components\/navigation\/theme-toggle\.component\.js"/,
		)
		assert.match(result, /"exportName":"ThemeToggle"/)
		assert.match(result, /"props":\{"label":"Toggle theme"\}/)
	})
})

describe('theme-toggle component entry static file', () => {
	it('GET /components/navigation/theme-toggle.component.js returns 200 with javascript content-type', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/theme-toggle.component.js',
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

	it('theme-toggle entry drives the button from remix toggle primitives', async () => {
		const response = await router.fetch(
			'http://localhost/components/navigation/theme-toggle.component.js',
		)
		const body = await response.text()
		assert.match(body, /clientEntry/)
		assert.match(body, /from 'remix\/ui\/toggle\/primitives'/)
		// The document-level click delegation this component used before is gone.
		assert.doesNotMatch(body, /addEventListeners/)
	})
})
