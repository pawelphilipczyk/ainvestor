import * as assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { BrowserTestSession } from '../../lib/browser-test.ts'
import {
	DESKTOP_VIEWPORT,
	startBrowserTestSession,
} from '../../lib/browser-test.ts'
import { seedSharedCatalog } from '../../lib/browser-test-fixtures.ts'

/**
 * `data-rmx-document` opts a link out of the runtime's frame navigation and
 * forces a real document load. The attribute name is load-bearing and easy to
 * get wrong — the runtime reads `data-rmx-document`, and an unprefixed
 * `rmx-document` is silently inert, leaving every nav link doing a frame swap
 * with no error anywhere. Nothing but a browser can catch that, hence this
 * test.
 */
describe('document navigation opt-out (browser)', () => {
	let session: BrowserTestSession

	before(async () => {
		// The catalog links this file navigates through only render when the
		// shared catalog has entries; each test file is its own process.
		seedSharedCatalog()
		session = await startBrowserTestSession()
	})

	after(async () => {
		await session.close()
	})

	/**
	 * Marks `window`, clicks, and reports whether the global survived: a frame
	 * swap keeps it, a real document load tears it down.
	 */
	async function navigationKind(from: string, selector: string) {
		const opened = await session.openPage(DESKTOP_VIEWPORT)
		await opened.page.goto(`${session.baseUrl}${from}`, {
			waitUntil: 'networkidle',
		})
		await opened.page.evaluate(() => {
			Object.assign(window, { __documentNavigationProbe: 1 })
		})
		await opened.page.locator(selector).first().click()
		await opened.page.waitForTimeout(2000)
		const survived = await opened.page.evaluate(
			() =>
				(window as unknown as { __documentNavigationProbe?: number })
					.__documentNavigationProbe === 1,
		)
		return { opened, kind: survived ? 'frame-swap' : 'document' }
	}

	it('sidebar nav links perform a real document navigation', async () => {
		const opened = await session.openPage(DESKTOP_VIEWPORT)
		const { page } = opened
		await page.goto(`${session.baseUrl}/portfolio`, {
			waitUntil: 'networkidle',
		})

		// Survives a frame swap; destroyed only by a real document load.
		await page.evaluate(() => {
			Object.assign(window, { __documentNavigationProbe: 1 })
		})

		await page.click('#app-sidebar a[href="/guidelines"]')
		await page.waitForURL(`${session.baseUrl}/guidelines`)

		assert.equal(
			await page.evaluate(
				() =>
					(window as unknown as { __documentNavigationProbe?: number })
						.__documentNavigationProbe,
			),
			undefined,
			'window was torn down, so the browser really navigated',
		)
		assert.deepEqual(opened.problems, [])
	})

	/**
	 * `Link navigationLoading` and the catalog ETF links carry **both**
	 * `data-navigation-loading` and `data-rmx-document`, which pull in opposite
	 * directions, and the enhancement wins: it calls `preventDefault()` and then
	 * Remix `navigate()`, which the runtime treats as a programmatic navigation
	 * against the top frame. So `data-rmx-document` is inert on those links —
	 * they frame-swap, by design of the enhancement, in exchange for the busy
	 * state on the link.
	 *
	 * Pinned because it is genuinely surprising next to the test above, and
	 * because the redundant attribute invites someone to "fix" one of the two.
	 */
	it('data-navigation-loading overrides the document opt-out', async () => {
		const { opened, kind } = await navigationKind(
			'/catalog',
			'a[data-navigation-loading][href^="/catalog/etf/"]',
		)
		assert.equal(kind, 'frame-swap')
		assert.match(new URL(opened.page.url()).pathname, /^\/catalog\/etf\//)
		assert.deepEqual(opened.problems, [])
	})
})
