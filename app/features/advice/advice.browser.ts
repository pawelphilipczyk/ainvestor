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
import { setPrivateGistFetchTestOverlay } from '../../lib/private-gist-fetch-test-overlay.ts'
import { sessionCookie, sessionStorage } from '../../lib/session.ts'
import { setAdviceClient } from './advice-client.ts'

/**
 * Browser coverage for advice's 3 forms (buy-next run, portfolio-review run,
 * portfolio-review clear) ported from `data-frame-submit`/`FrameSubmitEnhancement`
 * to native `data-rmx-target="advice-result"` — see
 * `docs/UI_ARCHITECTURE_GUIDELINES.md` §10 and `docs/REMIX_RC_MIGRATION_STATUS.md`.
 * `advice-result-frame.component.ts` is the client entry driving its UX; unlike
 * the trade/guidelines/catalog ports, the `advice-result` Frame is now
 * unconditionally rendered (even before any analysis exists) so a submission
 * always has a named frame to target instead of falling back to a full
 * top-level document reload.
 */
describe('advice forms (browser)', () => {
	let session: BrowserTestSession
	const originalApprovedGithubLogins = process.env.APPROVED_GITHUB_LOGINS

	before(async () => {
		session = await startBrowserTestSession()
	})

	after(async () => {
		setAdviceClient(null)
		setPrivateGistFetchTestOverlay(null)
		if (originalApprovedGithubLogins === undefined) {
			delete process.env.APPROVED_GITHUB_LOGINS
		} else {
			process.env.APPROVED_GITHUB_LOGINS = originalApprovedGithubLogins
		}
		await session.close()
	})

	/** Opens `/advice` in a fresh, isolated browser context signed in with a linked gist. */
	async function openSignedIn(login: string): Promise<BrowserTestPage> {
		process.env.APPROVED_GITHUB_LOGINS = login
		setPrivateGistFetchTestOverlay({ etfs: [], guidelines: [] })
		const remixSession = await sessionStorage.read(null)
		remixSession.set('login', login)
		remixSession.set('token', 'test-token')
		// The private-gist test overlay (avoids real GitHub calls) matches this
		// exact token/gistId pair regardless of login — see
		// `private-gist-fetch-test-overlay.ts`.
		remixSession.set('gistId', 'gist-advice-test')
		const value = await sessionStorage.save(remixSession)
		if (value == null) throw new Error('expected session save value')
		const cookieHeader = await sessionCookie.serialize(value)
		const [nameValue] = cookieHeader.split(';')
		const eqIndex = nameValue.indexOf('=')

		const opened = await session.openPage(DESKTOP_VIEWPORT)
		await opened.page.context().addCookies([
			{
				name: nameValue.slice(0, eqIndex),
				value: nameValue.slice(eqIndex + 1),
				url: session.baseUrl,
			},
		])
		await opened.page.goto(`${session.baseUrl}/advice`, {
			waitUntil: 'networkidle',
		})
		return opened
	}

	it('run success: renders the result in the frame with no document navigation', async () => {
		setAdviceClient({
			chat: {
				completions: {
					create: async () => ({
						choices: [{ message: { content: 'Buy VTI for broad exposure.' } }],
					}),
				},
			},
		})

		const opened = await openSignedIn('advice-browser-run-success')
		const { page } = opened

		await page.fill('#cashAmount-buy-next', '1000')
		await page.click('#cashAmount-buy-next')
		await page
			.locator('form:has(#cashAmount-buy-next) button[type="submit"]')
			.click()
		await page.waitForFunction(
			() => document.body.innerText.includes('Buy VTI for broad exposure.'),
			undefined,
			{ timeout: 5000 },
		)

		assert.equal(
			new URL(page.url()).pathname + new URL(page.url()).search,
			'/advice?tab=buy_next',
			'the action posts back to the page itself, so no URL drift',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('run failure: renders the inline error in the frame and keeps the form filled in', async () => {
		setAdviceClient({
			chat: {
				completions: {
					create: async () => {
						throw new Error('simulated OpenAI outage')
					},
				},
			},
		})

		const opened = await openSignedIn('advice-browser-run-failure')
		const { page } = opened

		await page.fill('#cashAmount-buy-next', '500')
		await page
			.locator('form:has(#cashAmount-buy-next) button[type="submit"]')
			.click()
		await page.waitForSelector('[role="alert"]', { timeout: 5000 })

		assert.match(
			await page.evaluate(() => document.body.innerText),
			/We couldn't get advice right now/,
		)
		assert.equal(
			await page.inputValue('#cashAmount-buy-next'),
			'500',
			'a failed run leaves the form filled in for retry',
		)
		assert.equal(
			new URL(page.url()).pathname,
			'/advice',
			'no document navigation on a failed run',
		)
		assert.deepEqual(opened.problems, [])
	})

	it('clear: empties the frame with no document navigation', async () => {
		setAdviceClient({
			chat: {
				completions: {
					create: async () => ({
						choices: [{ message: { content: 'Concentrated in equities.' } }],
					}),
				},
			},
		})

		const opened = await openSignedIn('advice-browser-clear')
		const { page } = opened

		await page.getByRole('tab', { name: 'Portfolio health review' }).click()
		await page.waitForSelector('#adviceModel-review')
		await page
			.locator('form:has(#adviceModel-review) button[type="submit"]')
			.click()
		await page.waitForFunction(
			() => document.body.innerText.includes('Concentrated in equities.'),
			undefined,
			{ timeout: 5000 },
		)

		await page.click('button:has-text("Clear saved review")')
		await page.waitForFunction(
			() => !document.body.innerText.includes('Concentrated in equities.'),
			undefined,
			{ timeout: 5000 },
		)

		assert.equal(
			new URL(page.url()).pathname,
			'/advice',
			'no document navigation on clear',
		)
		assert.deepEqual(opened.problems, [])
	})
})

/**
 * `advice-mode-tabs.component.ts`: real, client-side `remix/ui/tabs/primitives`
 * usage, same shape as `guidelines-tabs.component.ts` but pointing the
 * shared `advice-result` Frame at the other mode's own fragment URL and
 * reloading it on switch, instead of toggling a `hidden` panel — each mode's
 * form defaults are gist-backed and mode-specific, so they're fetched fresh
 * per switch rather than both loaded up front. See
 * `docs/REMIX_RC_MIGRATION_STATUS.md` for the design trace.
 */
describe('advice mode tabs (browser)', () => {
	let session: BrowserTestSession
	const originalApprovedGithubLogins = process.env.APPROVED_GITHUB_LOGINS

	before(async () => {
		session = await startBrowserTestSession()
	})

	after(async () => {
		setPrivateGistFetchTestOverlay(null)
		if (originalApprovedGithubLogins === undefined) {
			delete process.env.APPROVED_GITHUB_LOGINS
		} else {
			process.env.APPROVED_GITHUB_LOGINS = originalApprovedGithubLogins
		}
		await session.close()
	})

	async function openAdvice() {
		process.env.APPROVED_GITHUB_LOGINS = 'advice-browser-tabs'
		setPrivateGistFetchTestOverlay({ etfs: [], guidelines: [] })
		const remixSession = await sessionStorage.read(null)
		remixSession.set('login', 'advice-browser-tabs')
		remixSession.set('token', 'test-token')
		remixSession.set('gistId', 'gist-advice-test')
		const value = await sessionStorage.save(remixSession)
		if (value == null) throw new Error('expected session save value')
		const cookieHeader = await sessionCookie.serialize(value)
		const [nameValue] = cookieHeader.split(';')
		const eqIndex = nameValue.indexOf('=')

		const opened = await session.openPage(DESKTOP_VIEWPORT)
		await opened.page.context().addCookies([
			{
				name: nameValue.slice(0, eqIndex),
				value: nameValue.slice(eqIndex + 1),
				url: session.baseUrl,
			},
		])
		await opened.page.goto(`${session.baseUrl}/advice`, {
			waitUntil: 'networkidle',
		})
		return opened
	}

	it('mouse click switches the frame to the other mode with no navigation', async () => {
		const { page, problems } = await openAdvice()
		const urlBefore = page.url()

		assert.equal(await page.locator('#cashAmount-buy-next').isVisible(), true)

		await page.getByRole('tab', { name: 'Portfolio health review' }).click()
		await page.waitForSelector('#adviceModel-review')

		assert.equal(
			await page.locator('#cashAmount-buy-next').count(),
			0,
			'the buy_next form is gone — the frame now holds the other mode entirely',
		)
		assert.equal(page.url(), urlBefore, 'switching tabs must not navigate')
		assert.deepEqual(problems, [])
	})

	it('keyboard: Enter and Space activate a focused tab and reload the frame', async () => {
		const { page, problems } = await openAdvice()

		await page.getByRole('tab', { name: 'Portfolio health review' }).focus()
		await page.keyboard.press('Enter')
		await page.waitForSelector('#adviceModel-review')

		await page.getByRole('tab', { name: 'What to buy next' }).focus()
		await page.keyboard.press(' ')
		await page.waitForSelector('#cashAmount-buy-next')

		assert.deepEqual(problems, [])
	})

	it('no-JS: the initial tab from ?tab= still renders correctly server-side', async () => {
		const context = await session.browser.newContext({
			javaScriptEnabled: false,
		})
		const page = await context.newPage()
		process.env.APPROVED_GITHUB_LOGINS = 'advice-browser-tabs-nojs'
		setPrivateGistFetchTestOverlay({ etfs: [], guidelines: [] })
		const remixSession = await sessionStorage.read(null)
		remixSession.set('login', 'advice-browser-tabs-nojs')
		remixSession.set('token', 'test-token')
		remixSession.set('gistId', 'gist-advice-test')
		const value = await sessionStorage.save(remixSession)
		if (value == null) throw new Error('expected session save value')
		const cookieHeader = await sessionCookie.serialize(value)
		const [nameValue] = cookieHeader.split(';')
		const eqIndex = nameValue.indexOf('=')
		await context.addCookies([
			{
				name: nameValue.slice(0, eqIndex),
				value: nameValue.slice(eqIndex + 1),
				url: session.baseUrl,
			},
		])

		await page.goto(`${session.baseUrl}/advice?tab=portfolio_review`, {
			waitUntil: 'load',
		})
		assert.equal(await page.locator('#adviceModel-review').isVisible(), true)
		assert.equal(await page.locator('#cashAmount-buy-next').count(), 0)
		await context.close()
	})
})
