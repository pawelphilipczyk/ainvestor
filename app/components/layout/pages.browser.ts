import * as assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { BrowserTestSession } from '../../lib/browser-test.ts'
import {
	DESKTOP_VIEWPORT,
	startBrowserTestSession,
} from '../../lib/browser-test.ts'
import { seedSharedCatalog } from '../../lib/browser-test-fixtures.ts'

const PAGES = ['/', '/portfolio', '/guidelines', '/catalog', '/advice']

/**
 * Smoke test across every main page: it loads, the client runtime hydrates, and
 * nothing lands in the console. Cheap, and it is the check that would have
 * caught the whole class of rc.2 client breakage the migration plan warns
 * about — a client entry that fails at import time takes hydration down on
 * every page at once, silently, while the server-rendered HTML still looks fine.
 */
describe('every page loads and hydrates (browser)', () => {
	let session: BrowserTestSession

	before(async () => {
		seedSharedCatalog()
		session = await startBrowserTestSession()
	})

	after(async () => {
		await session.close()
	})

	for (const path of PAGES) {
		it(`${path} renders and hydrates cleanly`, async () => {
			const opened = await session.openPage(DESKTOP_VIEWPORT)
			const response = await opened.page.goto(`${session.baseUrl}${path}`, {
				waitUntil: 'networkidle',
			})

			assert.equal(response?.status(), 200)
			assert.equal(
				await opened.page.evaluate(() =>
					document.querySelector('[data-theme-toggle]')?.getAttribute('role'),
				),
				'switch',
				'the theme toggle mixin ran, so the runtime hydrated this page',
			)
			assert.deepEqual(opened.problems, [])
		})
	}

	it('the locale select switches server-rendered copy and back', async () => {
		const opened = await session.openPage(DESKTOP_VIEWPORT)
		const { page } = opened
		await page.goto(`${session.baseUrl}/portfolio`, {
			waitUntil: 'networkidle',
		})

		await page.selectOption('#ui-locale-select', 'pl')
		await page.waitForFunction(() => document.documentElement.lang === 'pl', {
			timeout: 5000,
		})
		assert.equal(
			await page.evaluate(
				() =>
					(document.querySelector('#ui-locale-select') as HTMLSelectElement)
						?.value,
			),
			'pl',
			'the select reflects the active locale after the round-trip',
		)

		await page.selectOption('#ui-locale-select', 'en')
		await page.waitForFunction(() => document.documentElement.lang === 'en', {
			timeout: 5000,
		})
		assert.deepEqual(opened.problems, [])
	})
})
