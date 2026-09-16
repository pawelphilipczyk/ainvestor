import * as assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import { assetHref } from '../../lib/remix-assets.ts'
import { router } from '../../router.ts'
import { ThemeToggle } from './theme-toggle.component.js'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

function renderThemeToggle() {
	return renderToString(jsx(ThemeToggle, { label: 'Toggle theme' }))
}

function themeToggleHref() {
	return assetHref('app/components/navigation/theme-toggle.component.js')
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
		// Through the router, not `renderToString`: the browser module URL is
		// resolved from the entry's source path by the `render()` middleware's
		// asset server, and `renderToString` takes no `resolveClientEntry` hook.
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, new RegExp(`"moduleUrl":"${await themeToggleHref()}"`))
		assert.match(body, /"exportName":"ThemeToggle"/)
		assert.doesNotMatch(
			body,
			/"moduleUrl":"file:/,
			'a client entry leaked its filesystem path into the hydration payload',
		)
	})

	it('ThemeToggle takes its label as a serialized hydration prop', async () => {
		const result = await renderThemeToggle()
		assert.match(result, /"props":\{"label":"Toggle theme"\}/)
	})
})

describe('theme-toggle component entry asset', () => {
	it('the theme-toggle entry is served with a javascript content-type', async () => {
		const response = await router.fetch(
			new URL(await themeToggleHref(), 'http://localhost/'),
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
			new URL(await themeToggleHref(), 'http://localhost/'),
		)
		const body = await response.text()
		assert.match(body, /clientEntry/)
		// Compiled output, not the source file: quoting is the asset server's choice.
		assert.match(body, /from ['"]remix\/ui\/toggle\/primitives['"]/)
		// The document-level click delegation this component used before is gone.
		assert.doesNotMatch(body, /addEventListeners/)
	})
})
