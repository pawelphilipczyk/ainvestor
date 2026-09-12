import * as assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { BrowserTestSession } from '../../lib/browser-test.ts'
import {
	DESKTOP_VIEWPORT,
	startBrowserTestSession,
} from '../../lib/browser-test.ts'
import { seedSharedCatalog } from '../../lib/browser-test-fixtures.ts'

/**
 * Browser coverage for the catalog list's `method="get"` filter form, ported
 * from `FrameSubmitEnhancement`'s `data-frame-submit` +
 * `data-frame-get-fragment-action` to native `data-rmx-target="catalog-list"`
 * — see `docs/REMIX_RC_MIGRATION_STATUS.md`. Every other `data-rmx-target`
 * port so far was a POST form; this is the first GET one, so it is measured
 * here rather than assumed to behave the same way.
 */
describe('catalog list filter form (browser)', () => {
	let session: BrowserTestSession

	before(async () => {
		seedSharedCatalog()
		session = await startBrowserTestSession()
	})

	after(async () => {
		await session.close()
	})

	it('filtering by type patches the list frame in place and updates the address bar', async () => {
		const opened = await session.openPage(DESKTOP_VIEWPORT)
		const { page } = opened
		await page.goto(`${session.baseUrl}/catalog`, {
			waitUntil: 'networkidle',
		})

		// A full document reload replaces `window`, losing this marker. A
		// frame-targeted `data-rmx-target` reload patches the DOM in place and
		// keeps it — same technique the rc.2 migration used to catch the
		// `data-rmx-document` regression (see the migration status doc).
		await page.evaluate(() => {
			Reflect.set(window, '__browserTestMarker', true)
		})

		await page.selectOption('#type', 'bond')
		await page.click('form[data-catalog-filter-form] button[type="submit"]')
		await page.waitForFunction(
			() =>
				document.body.innerText.includes('BTBD') &&
				!document.body.innerText.includes('BTEQ'),
			undefined,
			{ timeout: 5000 },
		)

		assert.equal(
			await page.evaluate(() => Reflect.get(window, '__browserTestMarker')),
			true,
			'the filter reload patched the catalog-list frame in place instead of doing a full navigation',
		)
		const url = new URL(page.url())
		assert.equal(
			url.searchParams.get('type'),
			'bond',
			'the address bar reflects the filter, since the form posts back to its own page',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('a filter change replaces the history entry instead of growing the stack', async () => {
		const opened = await session.openPage(DESKTOP_VIEWPORT)
		const { page } = opened
		// Two real navigations first, so there is an earlier page to land back
		// on — distinct from whatever `data-rmx-history="replace"` does to the
		// entries the filter submissions themselves touch.
		await page.goto(`${session.baseUrl}/`, { waitUntil: 'networkidle' })
		await page.goto(`${session.baseUrl}/catalog`, {
			waitUntil: 'networkidle',
		})

		await page.selectOption('#type', 'bond')
		await page.click('form[data-catalog-filter-form] button[type="submit"]')
		await page.waitForFunction(
			() => document.body.innerText.includes('BTBD'),
			undefined,
			{ timeout: 5000 },
		)
		await page.selectOption('#type', 'equity')
		await page.click('form[data-catalog-filter-form] button[type="submit"]')
		await page.waitForFunction(
			() => document.body.innerText.includes('BTEQ'),
			undefined,
			{ timeout: 5000 },
		)

		// Both filter submissions replaced the current entry (matching the old
		// `history.replaceState` behavior in `frame-submit.component.js`), so
		// one "back" from the second filter skips over both and lands on the
		// page that was current before the first one — not on `/catalog` or
		// `/catalog?type=bond` in between.
		await page.goBack({ waitUntil: 'networkidle' })

		assert.equal(
			new URL(page.url()).pathname,
			'/',
			'a single back step lands on the pre-filter page, since every filter submission replaced rather than pushed',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('shows a busy state on the submit button while the frame reloads', async () => {
		const opened = await session.openPage(DESKTOP_VIEWPORT)
		const { page } = opened
		await page.goto(`${session.baseUrl}/catalog`, {
			waitUntil: 'networkidle',
		})

		await page.selectOption('#type', 'bond')
		await page.click('form[data-catalog-filter-form] button[type="submit"]')
		await page.waitForSelector(
			'form[data-rmx-target="catalog-list"] button[aria-busy="true"]',
			{ timeout: 5000 },
		)
		await page.waitForFunction(
			() => document.body.innerText.includes('BTBD'),
			undefined,
			{ timeout: 5000 },
		)
		assert.equal(
			await page.evaluate(() =>
				document
					.querySelector('form[data-rmx-target="catalog-list"] button')
					?.hasAttribute('aria-busy'),
			),
			false,
			'busy state clears once the reload completes',
		)
		assert.deepEqual(opened.problems, [])
	})
})
