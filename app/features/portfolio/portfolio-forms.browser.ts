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
 * Browser coverage for the portfolio trade form and CSV import, both
 * `data-rmx-target="portfolio-list"` forms driven by `PortfolioListFrame`
 * (`app/features/portfolio/portfolio-list-frame.component.js`) — see
 * `docs/UI_ARCHITECTURE_GUIDELINES.md` §10 and
 * `docs/REMIX_RC_MIGRATION_STATUS.md`.
 *
 * Originally written as characterization tests for the hand-rolled
 * `FrameSubmitEnhancement` mechanism these forms used to run on, before each
 * was ported to the rc.2 runtime's native form navigation. That mechanism
 * (and its `data-frame-submit`-driven catalog filter-form sibling test) is
 * gone now that every form using it has moved — see the catalog list's own
 * `catalog-list-filter.browser.ts` for that one — but the assertions here
 * (what the frame region shows, where the URL bar points, whether the form
 * reset) are still this repo's only browser coverage for portfolio's forms,
 * so they stay, renamed to reflect what they actually exercise today.
 */
describe('portfolio forms (browser)', () => {
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

	it('trade form: buy re-renders the list frame and resets the form', async () => {
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

	it('trade form, 422: renders the inline error in the list frame without navigating', async () => {
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

	it('an unrelated same-page reload of the frame does not touch the unsubmitted trade form', async () => {
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

	it('CSV import: paste succeeds and updates the holdings frame', async () => {
		const opened = await open('/portfolio')
		const { page } = opened

		await page.fill(
			'#portfolioCsvPaste',
			'Papier;Giełda;Wartość;Waluta\nIBTA LN ETF;GBR-LSE;4087.48;PLN',
		)
		await page.click('#portfolio-import-form button[type="submit"]')
		await page.waitForFunction(
			() => {
				const text = document.body.innerText
				const index = text.indexOf('Your Holdings')
				return index !== -1 && text.slice(index).includes('IBTA')
			},
			undefined,
			{ timeout: 5000 },
		)

		assert.match(
			await holdingsText(opened),
			/IBTA/,
			'imported holding appears in the frame',
		)
		assert.equal(
			new URL(page.url()).pathname,
			'/portfolio',
			'no document navigation',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('CSV import, no valid rows: renders the inline error in the list frame without navigating', async () => {
		const opened = await open('/portfolio')
		const { page } = opened

		await page.fill('#portfolioCsvPaste', 'not,a,valid,csv')
		await page.click('#portfolio-import-form button[type="submit"]')
		await page.waitForFunction(
			() => document.body.innerText.includes('No holdings found in that CSV'),
			undefined,
			{ timeout: 5000 },
		)

		assert.match(
			await pageText(opened),
			/No holdings found in that CSV/,
			'inline error rendered inside the list frame',
		)
		assert.equal(
			new URL(page.url()).pathname,
			'/portfolio',
			'no document navigation on validation failure',
		)
		assert.deepEqual(opened.problems, [
			'[console.error] Failed to load resource: the server responded with a status of 422 ()',
		])
	})
})
