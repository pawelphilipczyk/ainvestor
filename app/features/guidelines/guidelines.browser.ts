import * as assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
	BrowserTestPage,
	BrowserTestSession,
} from '../../lib/browser-test.ts'
import {
	DESKTOP_VIEWPORT,
	startBrowserTestSession,
} from '../../lib/browser-test.ts'
import { seedSharedCatalog } from '../../lib/browser-test-fixtures.ts'

/**
 * Browser coverage for the guidelines page's four `data-rmx-target="guidelines-list"`
 * forms (add-instrument, add-bucket, per-row update-target, per-row delete), all
 * POSTing to the single `guidelines.action` route (`/guidelines`) and discriminated
 * by a hidden `guidelineIntent` field — see `docs/UI_ARCHITECTURE_GUIDELINES.md` §10
 * and `docs/REMIX_RC_MIGRATION_STATUS.md`. `guidelines-list-frame.component.js` is
 * the shared client entry driving their UX.
 *
 * Row presence/absence is asserted via `li:has-text(...)` selectors, not a
 * whole-page text search: the instrument `<select>` lists every catalog
 * ticker as option text, which `document.body.innerText` includes even while
 * the dropdown is closed — a scoped `li` selector sidesteps that, the same
 * caveat portfolio's `holdingsText` documents in
 * `app/components/client/frame-submit.browser.ts`.
 */
describe('guidelines forms (browser)', () => {
	let session: BrowserTestSession

	before(async () => {
		seedSharedCatalog()
		session = await startBrowserTestSession()
	})

	after(async () => {
		await session.close()
	})

	async function open(path: string) {
		const opened = await session.openPage(DESKTOP_VIEWPORT)
		await opened.page.goto(`${session.baseUrl}${path}`, {
			waitUntil: 'networkidle',
		})
		return opened
	}

	const pageText = ({ page }: BrowserTestPage) =>
		page.evaluate(() => document.body.innerText)

	async function addInstrument(
		{ page }: BrowserTestPage,
		ticker: string,
		targetPct: string,
	) {
		await page.selectOption('#instrumentTicker', ticker)
		await page.fill('#instrumentTargetPct', targetPct)
		await page.click('#guidelines-add-form button[type="submit"]')
	}

	it('add-instrument form: success resets the form, keeps the URL on /guidelines, and lists the guideline', async () => {
		const opened = await open('/guidelines?tab=instrument')
		const { page } = opened

		await addInstrument(opened, 'BTEQ', '40')
		await page.waitForSelector('li:has-text("BTEQ")', { timeout: 5000 })

		assert.equal(
			new URL(page.url()).pathname,
			'/guidelines',
			'the action posts back to the page itself, so no URL drift',
		)
		assert.equal(
			await page.evaluate(
				() =>
					(document.querySelector('#instrumentTicker') as HTMLSelectElement)
						?.value,
			),
			'',
			'data-reset-form cleared the select back to its placeholder',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('add-bucket form, 422 duplicate: renders the inline error without navigating and keeps the field value', async () => {
		const opened = await open('/guidelines')
		const { page } = opened

		await page.selectOption('#assetClassType', 'equity')
		await page.fill('#assetTargetPct', '40')
		await page.click('#guidelines-add-form button[type="submit"]')
		await page.waitForSelector('li:has-text("bucket")', { timeout: 5000 })

		await page.selectOption('#assetClassType', 'equity')
		await page.fill('#assetTargetPct', '30')
		await page.click('#guidelines-add-form button[type="submit"]')
		await page.waitForFunction(
			() => document.body.innerText.includes('already have a guideline'),
			undefined,
			{ timeout: 5000 },
		)

		assert.match(
			await pageText(opened),
			/already have a guideline for the equity asset class/,
			'inline error rendered inside the list frame',
		)
		assert.equal(
			new URL(page.url()).pathname,
			'/guidelines',
			'no document navigation on validation failure',
		)
		assert.equal(
			await page.evaluate(
				() =>
					(document.querySelector('#assetTargetPct') as HTMLInputElement)
						?.value,
			),
			'30',
			'data-reset-form does not clear the form on a validation failure',
		)
		// Chromium logs a devtools console error for any non-2xx fetch response
		// regardless of whether the app handles it — expected here, not a
		// hydration or runtime problem.
		assert.deepEqual(opened.problems, [
			'[console.error] Failed to load resource: the server responded with a status of 422 ()',
		])
	})

	it('update-target form: saves the new value, stays on /guidelines, and the edit form returns to its hidden state', async () => {
		const opened = await open('/guidelines?tab=instrument')
		const { page } = opened

		await addInstrument(opened, 'BTEQ', '40')
		await page.waitForSelector('li:has-text("BTEQ")', { timeout: 5000 })

		await page.click('li:has-text("BTEQ") [data-guideline-edit]')
		await page
			.locator(
				'li:has-text("BTEQ") [data-guideline-edit-form] input[name="targetPct"]',
			)
			.fill('65')
		await page.click(
			'li:has-text("BTEQ") [data-guideline-edit-form] button[type="submit"]',
		)
		await page.waitForSelector('li:has-text("65")', { timeout: 5000 })

		assert.equal(
			new URL(page.url()).pathname,
			'/guidelines',
			'the action posts back to the page itself, so no URL drift',
		)
		assert.equal(
			await page.evaluate(() => {
				const row = Array.from(document.querySelectorAll('li')).find((el) =>
					el.textContent?.includes('BTEQ'),
				)
				const form = row?.querySelector('[data-guideline-edit-form]')
				return form?.classList.contains('hidden') ?? false
			}),
			true,
			'edit form is hidden again once the frame re-renders the read state',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('delete via dialog: removes the row', async () => {
		const opened = await open('/guidelines?tab=instrument')
		const { page } = opened

		await addInstrument(opened, 'BTEQ', '40')
		await page.waitForSelector('li:has-text("BTEQ")', { timeout: 5000 })

		await page.click('li:has-text("BTEQ") [data-dialog-id]')
		await page.waitForSelector('dialog[open]')
		await page.click('dialog[open] form[method="post"] button[type="submit"]')
		await page.waitForSelector('li:has-text("BTEQ")', {
			state: 'detached',
			timeout: 5000,
		})

		assert.equal(
			await page.locator('li').count(),
			0,
			'no rows left after deleting the only guideline',
		)
		assert.equal(
			await page.evaluate(
				() => document.querySelectorAll('dialog[open]').length,
			),
			0,
			'the delete-confirmation dialog does not survive its own submission',
		)
		assert.equal(
			new URL(page.url()).pathname,
			'/guidelines',
			'the action posts back to the page itself, so no URL drift',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('an unrelated same-page reload of the frame does not touch the unsubmitted add form', async () => {
		const opened = await open('/guidelines?tab=instrument')
		const { page } = opened

		await page.selectOption('#instrumentTicker', 'BTEQ')
		await page.fill('#instrumentTargetPct', '12345')

		// The locale switch is a same-page soft navigation that reuses the
		// persisted `guidelines-list` Frame instance, dispatching an "inherited"
		// reloadStart/reloadComplete on it even though this form was never
		// submitted — it must not touch the form's unsaved value or button state.
		await page.selectOption('#ui-locale-select', 'pl')
		await page.waitForFunction(() => document.documentElement.lang === 'pl', {
			timeout: 5000,
		})

		assert.equal(
			await page.evaluate(
				() =>
					(document.querySelector('#instrumentTargetPct') as HTMLInputElement)
						?.value,
			),
			'12345',
			'an unrelated frame reload must not clear the unsubmitted form',
		)
		assert.deepEqual(opened.problems, [])
	})
})
