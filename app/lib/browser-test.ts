import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Browser, BrowserContext, ConsoleMessage, Page } from 'playwright'
import { chromium } from 'playwright'
import { createRequestListener } from 'remix/node-fetch-server'
import { router } from '../router.ts'
import { approvedSessionCookie } from './test-session-fetch.ts'

/**
 * Boots the app on an ephemeral port and drives it with a real Chromium.
 *
 * Hydration, event wiring and mixin behavior fail only in a browser: nothing
 * else runs them. `tsc` covers a `.component.ts` entry's types since Stage 4
 * of `docs/REMIX_ASSETS_MIGRATION_PLAN.md` (and sees nothing of an
 * unconverted `.component.js` or of `entry.js`), but types are not behavior
 * and the server-render tests never execute either. `docs/REMIX_RC_MIGRATION_PLAN.md` calls a browser pass
 * non-negotiable for exactly that reason.
 *
 * These files are named `*.browser.ts`, not `*.test.ts`, so `npm test` never
 * picks them up — they need a browser binary CI does not download. Run them
 * with `npm run test:browser`, after a one-time `npx playwright install
 * chromium`.
 *
 * **What these tests can and cannot assert.** `DocumentShell` loads Tailwind
 * from a CDN, which is stubbed out here so a run is deterministic and works
 * offline. Utility classes therefore produce no geometry: assert the state a
 * component owns (class lists, ARIA attributes, inline styles it writes,
 * `localStorage`) and inject explicit CSS with `page.addStyleTag()` when a test
 * genuinely needs layout. Breakpoint *behavior* is still real — the sidebar
 * branches on `matchMedia`, not on Tailwind.
 */
export type BrowserTestSession = {
	/** Origin the app is served from, e.g. `http://127.0.0.1:45213`. */
	baseUrl: string
	browser: Browser
	/**
	 * Fresh page, Tailwind stubbed, console and page errors already collected,
	 * and **signed in**: every page but `/` sits behind the sign-in gate, so a
	 * signed-out context would silently be redirected to the intro page and the
	 * test would assert against the wrong document.
	 */
	openPage: (viewport?: Viewport) => Promise<BrowserTestPage>
	close: () => Promise<void>
}

export type Viewport = { width: number; height: number }

export type BrowserTestPage = {
	page: Page
	/** Console errors and uncaught exceptions seen so far. Assert this is empty. */
	problems: string[]
}

export const DESKTOP_VIEWPORT: Viewport = { width: 1280, height: 800 }
export const MOBILE_VIEWPORT: Viewport = { width: 390, height: 844 }

/**
 * Stands in for the Tailwind CDN script. Real Tailwind is not needed to drive
 * behavior, and reaching for it makes every run depend on the network.
 */
const TAILWIND_STUB = 'globalThis.tailwind = { config: {} }'

/**
 * Signs a browser context in. Every page but `/` sits behind the sign-in gate,
 * so a signed-out context is redirected to the intro page and a test would
 * assert against the wrong document. `openPage` does this for you; call it
 * directly only when building a context by hand (a no-JS context, say).
 */
export async function signInBrowserContext(
	context: BrowserContext,
): Promise<void> {
	const [name = '', ...value] = (await approvedSessionCookie()).split('=')
	await context.addCookies([
		{ name, value: value.join('='), domain: '127.0.0.1', path: '/' },
	])
}

/**
 * Waits for a `data-rmx-target` form's submit to finish settling, after a test
 * has already waited for the reloaded frame content to appear.
 *
 * Content showing up is not the end of the submit: `watchFrameFormSubmissions`
 * clears the busy state, applies `data-reset-form` and
 * `data-frame-hide-form-on-success` in its `reloadComplete` handler, which runs
 * after the frame is patched. An assertion on any of those made straight after
 * the content wait races that handler and fails on a slow runner. All three
 * happen in the same synchronous handler, so the submit control losing
 * `aria-busy` means every one of them has landed.
 *
 * `state: 'attached'` because a `data-frame-hide-form-on-success` form is
 * hidden by then.
 */
export async function waitForFrameFormSettled(
	page: Page,
	formSelector: string,
) {
	try {
		await page.waitForSelector(
			`${formSelector} :is(button, input)[type="submit"]:not([aria-busy])`,
			{ state: 'attached', timeout: 5000 },
		)
	} catch {
		throw new Error(
			`the submit control in ${formSelector} was still aria-busy 5s after the frame reloaded — reloadComplete never settled the form`,
		)
	}
}

function launchOptions() {
	// Environments that ship a pinned browser build, rather than the one
	// `npx playwright install` fetches, can point at it directly.
	const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim()
	return executablePath ? { executablePath } : {}
}

export async function startBrowserTestSession(): Promise<BrowserTestSession> {
	const server = http.createServer(
		createRequestListener((request: Request) => router.fetch(request)),
	)
	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve)
	})
	const { port } = server.address() as AddressInfo

	const closeServer = () =>
		new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()))
		})

	let browser: Browser
	try {
		browser = await chromium.launch(launchOptions())
	} catch (error) {
		// Without this the listening socket keeps the process alive and the run
		// hangs instead of reporting why the browser could not start — which is
		// the very first thing anyone hits, before `npx playwright install
		// chromium`.
		await closeServer()
		throw error
	}

	return {
		baseUrl: `http://127.0.0.1:${port}`,
		browser,
		async openPage(viewport = MOBILE_VIEWPORT) {
			const page = await browser.newPage({ viewport })
			await signInBrowserContext(page.context())
			await page.route('https://cdn.tailwindcss.com/**', (route) =>
				route.fulfill({
					status: 200,
					contentType: 'text/javascript',
					body: TAILWIND_STUB,
				}),
			)
			await page.route('**/favicon.ico', (route) =>
				route.fulfill({ status: 204, body: '' }),
			)
			const problems: string[] = []
			page.on('console', (message: ConsoleMessage) => {
				if (message.type() === 'error' || message.type() === 'warning') {
					problems.push(`[console.${message.type()}] ${message.text()}`)
				}
			})
			page.on('pageerror', (error: Error) => {
				problems.push(`[pageerror] ${error.message}`)
			})
			return { page, problems }
		},
		async close() {
			try {
				await browser.close()
			} finally {
				await closeServer()
			}
		},
	}
}
