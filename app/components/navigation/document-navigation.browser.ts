import * as assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { BrowserTestSession } from '../../lib/browser-test.ts'
import {
	DESKTOP_VIEWPORT,
	startBrowserTestSession,
} from '../../lib/browser-test.ts'

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
		session = await startBrowserTestSession()
	})

	after(async () => {
		await session.close()
	})

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
})
