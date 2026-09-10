import * as assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
	BrowserTestPage,
	BrowserTestSession,
	Viewport,
} from '../../lib/browser-test.ts'
import {
	DESKTOP_VIEWPORT,
	MOBILE_VIEWPORT,
	startBrowserTestSession,
} from '../../lib/browser-test.ts'

/**
 * The mobile sidebar overlay is the highest-risk client code in the app: it
 * lives in `sidebar.component.js`, which `tsconfig.json` does not include, and
 * it fails only in a browser. `docs/REMIX_RC_MIGRATION_PLAN.md` requires a
 * browser pass over exactly these interactions; the Stage 6 attempt to hand
 * this behavior to `remix/ui/popover` (see §6 of that plan for the measured
 * reasons it does not fit) is what prompted writing them down.
 *
 * Open/close state is asserted through the class and ARIA state the component
 * owns rather than geometry, because Tailwind is stubbed (see `browser-test.ts`).
 * The desktop/mobile split is real regardless: the component branches on
 * `matchMedia('(min-width: 768px)')`.
 */
describe('sidebar overlay (browser)', () => {
	let session: BrowserTestSession

	before(async () => {
		session = await startBrowserTestSession()
	})

	after(async () => {
		await session.close()
	})

	async function openHome(viewport: Viewport) {
		const opened = await session.openPage(viewport)
		await opened.page.goto(`${session.baseUrl}/`, { waitUntil: 'networkidle' })
		return opened
	}

	const isOffCanvas = ({ page }: BrowserTestPage) =>
		page.evaluate(() =>
			document
				.querySelector('#app-sidebar')
				?.classList.contains('-translate-x-full'),
		)

	const documentOverflow = ({ page }: BrowserTestPage) =>
		page.evaluate(() => document.documentElement.style.overflow)

	const toggleExpanded = ({ page }: BrowserTestPage) =>
		page.evaluate(() =>
			document
				.querySelector('[data-sidebar-toggle]')
				?.getAttribute('aria-expanded'),
		)

	it('opens from the toggle, locks scroll, and closes on the close button', async () => {
		const opened = await openHome(MOBILE_VIEWPORT)
		assert.equal(await isOffCanvas(opened), true, 'starts off-canvas')
		assert.equal(await toggleExpanded(opened), 'false')

		await opened.page.click('[data-sidebar-toggle]')
		assert.equal(await isOffCanvas(opened), false, 'slides in')
		assert.equal(await toggleExpanded(opened), 'true')
		assert.equal(await documentOverflow(opened), 'hidden', 'locks page scroll')

		await opened.page.click('[data-sidebar-close]')
		assert.equal(await isOffCanvas(opened), true, 'slides back out')
		assert.equal(await toggleExpanded(opened), 'false')
		assert.equal(await documentOverflow(opened), '', 'releases page scroll')
		assert.deepEqual(opened.problems, [])
	})

	it('closes on backdrop click and on Escape', async () => {
		const opened = await openHome(MOBILE_VIEWPORT)

		await opened.page.click('[data-sidebar-toggle]')
		// Dispatched rather than clicked: with Tailwind stubbed the backdrop has
		// no box to hit. The handler is document-level delegation keyed on
		// `closest('#sidebar-backdrop')`, so this exercises the real path.
		await opened.page.locator('#sidebar-backdrop').dispatchEvent('click')
		assert.equal(await isOffCanvas(opened), true, 'backdrop closes it')
		assert.equal(await documentOverflow(opened), '')

		await opened.page.click('[data-sidebar-toggle]')
		await opened.page.keyboard.press('Escape')
		assert.equal(await isOffCanvas(opened), true, 'Escape closes it')
		assert.equal(await documentOverflow(opened), '')
		assert.deepEqual(opened.problems, [])
	})

	it('never locks scroll at desktop widths', async () => {
		const opened = await openHome(DESKTOP_VIEWPORT)

		await opened.page.click('[data-sidebar-toggle]', { force: true })
		assert.equal(
			await documentOverflow(opened),
			'',
			'the desktop rail is not an overlay, so it must not lock the page',
		)
		assert.deepEqual(opened.problems, [])
	})
})
