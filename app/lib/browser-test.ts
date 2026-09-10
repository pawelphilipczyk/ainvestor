import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Browser, ConsoleMessage, Page } from 'playwright'
import { chromium } from 'playwright'
import { createRequestListener } from 'remix/node-fetch-server'
import { router } from '../router.ts'

/**
 * Boots the app on an ephemeral port and drives it with a real Chromium.
 *
 * The client runtime lives in `.component.js` / `entry.js` files that
 * `tsconfig.json` does not include, so neither `tsc` nor the server-render
 * tests see it: hydration, event wiring and mixin behavior fail only in a
 * browser. `docs/REMIX_RC_MIGRATION_PLAN.md` calls a browser pass
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
	/** Fresh page, Tailwind stubbed, console and page errors already collected. */
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
	const browser = await chromium.launch(launchOptions())

	return {
		baseUrl: `http://127.0.0.1:${port}`,
		browser,
		async openPage(viewport = MOBILE_VIEWPORT) {
			const page = await browser.newPage({ viewport })
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
			await browser.close()
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()))
			})
		},
	}
}
