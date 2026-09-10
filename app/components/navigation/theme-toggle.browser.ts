import * as assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { BrowserTestSession } from '../../lib/browser-test.ts'
import { startBrowserTestSession } from '../../lib/browser-test.ts'

/**
 * Covers the Stage 6 move of this control onto `remix/ui/toggle/primitives`:
 * the mixin's wiring only exists after hydration, so a server-render test
 * cannot see any of it.
 */
describe('theme toggle (browser)', () => {
	let session: BrowserTestSession

	before(async () => {
		session = await startBrowserTestSession()
	})

	after(async () => {
		await session.close()
	})

	async function openHome() {
		const opened = await session.openPage()
		await opened.page.goto(`${session.baseUrl}/`, { waitUntil: 'networkidle' })
		return opened
	}

	const switchState = (page: Awaited<ReturnType<typeof openHome>>['page']) =>
		page.evaluate(() => {
			const button = document.querySelector('[data-theme-toggle]')
			return {
				isDark: document.documentElement.classList.contains('dark'),
				role: button?.getAttribute('role'),
				ariaChecked: button?.getAttribute('aria-checked'),
				dataState: button?.getAttribute('data-state'),
				storedTheme: localStorage.getItem('theme'),
			}
		})

	it('hydrates as a switch matching the server-rendered dark default', async () => {
		const opened = await openHome()
		assert.deepEqual(await switchState(opened.page), {
			isDark: true,
			role: 'switch',
			// Streamed as the bare attribute `aria-checked=""`; hydration rewrites
			// it to "true". See the note in theme-toggle.component.js.
			ariaChecked: 'true',
			dataState: 'checked',
			storedTheme: null,
		})
		assert.deepEqual(opened.problems, [])
	})

	it('toggles on click and on Space, persisting to localStorage', async () => {
		const opened = await openHome()

		await opened.page.click('[data-theme-toggle]')
		assert.deepEqual(await switchState(opened.page), {
			isDark: false,
			role: 'switch',
			ariaChecked: 'false',
			dataState: 'unchecked',
			storedTheme: 'light',
		})

		await opened.page.focus('[data-theme-toggle]')
		await opened.page.keyboard.press(' ')
		assert.deepEqual(await switchState(opened.page), {
			isDark: true,
			role: 'switch',
			ariaChecked: 'true',
			dataState: 'checked',
			storedTheme: 'dark',
		})
		assert.deepEqual(opened.problems, [])
	})

	it('reflects a persisted light theme after reload', async () => {
		const opened = await openHome()
		await opened.page.evaluate(() => localStorage.setItem('theme', 'light'))
		await opened.page.goto(`${session.baseUrl}/`, { waitUntil: 'networkidle' })

		assert.deepEqual(await switchState(opened.page), {
			isDark: false,
			role: 'switch',
			ariaChecked: 'false',
			dataState: 'unchecked',
			storedTheme: 'light',
		})
		assert.deepEqual(opened.problems, [], 'no hydration mismatch warning')
	})
})
