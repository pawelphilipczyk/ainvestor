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
 * Characterization tests for `FrameSubmitEnhancement`, one per mode it
 * supports. They pin the behavior as it is today so the Stage 6 move of the
 * form *mechanics* onto the rc.2 runtime's native form navigation
 * (`docs/REMIX_RC_MIGRATION_PLAN.md` §7) can be judged against something real.
 *
 * They assert user-visible outcomes — what the frame region shows, where the
 * URL bar points, whether the form reset — rather than internals, so they stay
 * meaningful across that change. Frames render as comment-delimited regions,
 * not elements, so frame content is read from the page text.
 */
describe('frame submit flows (browser)', () => {
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

	/**
	 * Text of the holdings region only. The fund `<select>` lists every catalog
	 * ticker, so a whole-page match would always find one.
	 */
	const holdingsText = ({ page }: BrowserTestPage) =>
		page.evaluate(() => {
			const text = document.body.innerText
			const index = text.indexOf('Your Holdings')
			return index === -1 ? '' : text.slice(index)
		})

	it('GET + fragment action: filters the list frame and syncs the document URL', async () => {
		const opened = await open('/catalog')
		const before = await pageText(opened)
		assert.match(before, /BTEQ/, 'equity fund listed before filtering')
		assert.match(before, /BTBD/, 'bond fund listed before filtering')

		await opened.page.selectOption('#type', 'bond')
		await opened.page.click('[data-catalog-filter-form] button[type="submit"]')
		await opened.page.waitForFunction(
			() => !document.body.innerText.includes('BTEQ'),
			undefined,
			{ timeout: 5000 },
		)

		const after = await pageText(opened)
		assert.match(after, /BTBD/, 'bond fund survives the filter')
		assert.doesNotMatch(after, /BTEQ/, 'equity fund filtered out of the frame')
		assert.match(opened.page.url(), /[?&]type=bond/, 'document URL carries it')
		assert.equal(
			new URL(opened.page.url()).pathname,
			'/catalog',
			'URL bar stays on the document, not the fragment route',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('POST + replace-from-response: re-renders the list frame and resets the form', async () => {
		const opened = await open('/portfolio')
		const { page } = opened
		assert.doesNotMatch(await holdingsText(opened), /BTEQ/, 'no holdings yet')

		await page.selectOption('#portfolioOperation', 'buy')
		await page.selectOption('#instrumentTicker', 'BTEQ')
		await page.fill('#portfolio-trade-form input[name="value"]', '100')
		await page.click('#portfolio-trade-form button[type="submit"]')
		await page.waitForFunction(
			() => {
				const text = document.body.innerText
				const index = text.indexOf('Your Holdings')
				return index !== -1 && text.slice(index).includes('BTEQ')
			},
			undefined,
			{ timeout: 5000 },
		)

		assert.match(
			await holdingsText(opened),
			/BTEQ/,
			'holding appears in the frame',
		)
		assert.equal(
			new URL(page.url()).pathname,
			'/portfolio',
			'no document navigation',
		)
		assert.equal(
			await page.evaluate(
				() =>
					(
						document.querySelector(
							'#portfolio-trade-form input[name="value"]',
						) as HTMLInputElement
					)?.value,
			),
			'',
			'data-reset-form cleared the form',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('POST + replace-from-response, 422: renders the inline error in the list frame without navigating', async () => {
		const opened = await open('/portfolio')
		const { page } = opened

		await page.selectOption('#portfolioOperation', 'sell')
		await page.selectOption('#instrumentTicker', 'BTEQ')
		await page.fill('#portfolio-trade-form input[name="value"]', '100')
		await page.click('#portfolio-trade-form button[type="submit"]')
		await page.waitForFunction(
			() =>
				document.body.innerText.includes(
					'You do not hold that fund in this currency yet',
				),
			undefined,
			{ timeout: 5000 },
		)

		assert.match(
			await pageText(opened),
			/You do not hold that fund in this currency yet/,
			'inline error rendered inside the list frame',
		)
		assert.equal(
			new URL(page.url()).pathname,
			'/portfolio',
			'no document navigation on validation failure',
		)
		assert.equal(
			await page.evaluate(
				() =>
					(
						document.querySelector(
							'#portfolio-trade-form input[name="value"]',
						) as HTMLInputElement
					)?.value,
			),
			'100',
			'data-reset-form does not clear the form on a validation failure',
		)
		// Chromium logs a devtools console error for any non-2xx fetch response
		// regardless of whether the app handles it, independent of the frame
		// submit code path. Expected here, not a hydration or runtime problem.
		assert.deepEqual(opened.problems, [
			'[console.error] Failed to load resource: the server responded with a status of 422 ()',
		])
	})

	it('data-rmx-target: an unrelated same-page reload of the frame does not touch the unsubmitted form', async () => {
		const opened = await open('/portfolio')
		const { page } = opened

		await page.selectOption('#portfolioOperation', 'buy')
		await page.selectOption('#instrumentTicker', 'BTEQ')
		await page.fill('#portfolio-trade-form input[name="value"]', '12345')

		// The locale switch is a same-page soft navigation that reuses the
		// persisted `portfolio-list` Frame instance, dispatching an "inherited"
		// reloadStart/reloadComplete on it even though this form was never
		// submitted — it must not touch the form's unsaved value or button state.
		await page.selectOption('#ui-locale-select', 'pl')
		await page.waitForFunction(() => document.documentElement.lang === 'pl', {
			timeout: 5000,
		})

		assert.equal(
			await page.evaluate(
				() =>
					(
						document.querySelector(
							'#portfolio-trade-form input[name="value"]',
						) as HTMLInputElement
					)?.value,
			),
			'12345',
			'an unrelated frame reload must not clear the unsubmitted form',
		)
		assert.deepEqual(opened.problems, [])
	})
})
