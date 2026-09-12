import * as assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { BrowserTestSession } from '../../lib/browser-test.ts'
import {
	DESKTOP_VIEWPORT,
	startBrowserTestSession,
} from '../../lib/browser-test.ts'
import { seedSharedCatalog } from '../../lib/browser-test-fixtures.ts'
import { setAdviceClient } from '../advice/advice-client.ts'

/**
 * Browser coverage for the catalog ETF detail page's
 * `data-rmx-target="catalog-etf-analysis"` "load analysis" form — see
 * `docs/UI_ARCHITECTURE_GUIDELINES.md` §10 and `docs/REMIX_RC_MIGRATION_STATUS.md`.
 * `catalog-etf-analysis-frame.component.js` is the client entry driving its UX,
 * including `data-frame-hide-form-on-success` — the one option neither prior
 * port (`PortfolioListFrame`, `GuidelinesListFrame`) needed.
 */
describe('catalog ETF analysis form (browser)', () => {
	let session: BrowserTestSession

	before(async () => {
		seedSharedCatalog()
		session = await startBrowserTestSession()
	})

	after(async () => {
		setAdviceClient(null)
		await session.close()
	})

	it('success: renders the analysis text, hides the form, and keeps the URL on the page', async () => {
		setAdviceClient({
			chat: {
				completions: {
					create: async () => ({
						choices: [{ message: { content: 'Educational ETF paragraph.' } }],
					}),
				},
			},
		})

		const opened = await session.openPage(DESKTOP_VIEWPORT)
		const { page } = opened
		await page.goto(`${session.baseUrl}/catalog/etf/browser-equity`, {
			waitUntil: 'networkidle',
		})

		await page.click(
			'form[data-rmx-target="catalog-etf-analysis"] button[type="submit"]',
		)
		await page.waitForFunction(
			() => document.body.innerText.includes('Educational ETF paragraph.'),
			undefined,
			{ timeout: 5000 },
		)

		assert.equal(
			new URL(page.url()).pathname,
			'/catalog/etf/browser-equity',
			'the action posts back to the page itself, so no URL drift',
		)
		assert.equal(
			await page.evaluate(
				() =>
					document
						.querySelector('form[data-rmx-target="catalog-etf-analysis"]')
						?.classList.contains('hidden') ?? false,
			),
			true,
			'data-frame-hide-form-on-success hides the form once the analysis has rendered',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('upstream failure: renders the inline error and leaves the form visible', async () => {
		setAdviceClient({
			chat: {
				completions: {
					create: async () => {
						throw new Error('simulated OpenAI outage')
					},
				},
			},
		})

		const opened = await session.openPage(DESKTOP_VIEWPORT)
		const { page } = opened
		await page.goto(`${session.baseUrl}/catalog/etf/browser-equity`, {
			waitUntil: 'networkidle',
		})

		await page.click(
			'form[data-rmx-target="catalog-etf-analysis"] button[type="submit"]',
		)
		await page.waitForSelector('[role="alert"]', { timeout: 5000 })

		assert.equal(
			await page.evaluate(
				() =>
					document
						.querySelector('form[data-rmx-target="catalog-etf-analysis"]')
						?.classList.contains('hidden') ?? false,
			),
			false,
			'a failed analysis leaves the form visible so the user can retry',
		)
		assert.equal(
			await page.evaluate(() =>
				document
					.querySelector('form[data-rmx-target="catalog-etf-analysis"] button')
					?.hasAttribute('aria-busy'),
			),
			false,
			'busy state clears after the failed submit',
		)
		assert.deepEqual(opened.problems, [])
	})
})
