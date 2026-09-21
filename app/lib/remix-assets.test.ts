import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { router } from '../router.ts'
import { assetHref, remixAssetServer } from './remix-assets.ts'
import {
	approvedSessionCookie,
	resetTestSessionCookieJar,
} from './test-session-fetch.ts'

afterEach(() => {
	resetTestSessionCookieJar()
})

/** Pages whose renders cover both paths to a client entry's browser URL. */
const PAGES = [
	// `context.render` — the `render({ assets })` middleware resolves entries.
	'/',
	// The four pages that pass a per-render `resolveFrame` and so render
	// through `renderToStream` directly, bypassing that middleware. They only
	// resolve entries because `app/components/render.ts` passes the same
	// resolver; without it each would emit a `file:` path as a script `src`.
	'/portfolio',
	'/guidelines',
	'/catalog',
	'/advice',
]

/** Every page but `/` sits behind the sign-in gate, so each fetch carries one. */
async function fetchPage(path: string): Promise<string> {
	const response = await router.fetch(`http://localhost${path}`, {
		headers: { Cookie: await approvedSessionCookie() },
	})
	assert.equal(response.status, 200, `GET ${path}`)
	return response.text()
}

function importMapOf(body: string): {
	imports: Record<string, string>
	scopes: Record<string, Record<string, string>>
} {
	const json =
		/<script data-rmx-import-map type="importmap">([\s\S]*?)<\/script>/.exec(
			body,
		)?.[1]
	assert.ok(json, 'document is missing its import map')
	return JSON.parse(json)
}

describe('client entries are served through the asset server', () => {
	for (const path of PAGES) {
		it(`${path} hydrates from browser URLs, never filesystem paths`, async () => {
			const body = await fetchPage(path)
			const moduleUrls = [
				...new Set(
					[...body.matchAll(/"moduleUrl":"([^"]+)"/g)].map((match) => match[1]),
				),
			]
			assert.ok(
				moduleUrls.length > 0,
				`${path} rendered no client entries at all`,
			)
			for (const moduleUrl of moduleUrls) {
				assert.ok(
					moduleUrl.startsWith('/assets/'),
					`${path} hydrates from ${moduleUrl}, which the browser cannot fetch`,
				)
				const response = await router.fetch(`http://localhost${moduleUrl}`)
				assert.equal(response.status, 200, `GET ${moduleUrl}`)
			}
		})
	}

	it('the document import map resolves every bare specifier its modules import', async () => {
		const body = await fetchPage('/guidelines')
		const { scopes } = importMapOf(body)
		const moduleUrls = [
			...new Set(
				[...body.matchAll(/"moduleUrl":"([^"]+)"/g)].map((match) => match[1]),
			),
		]

		for (const moduleUrl of moduleUrls) {
			const response = await router.fetch(`http://localhost${moduleUrl}`)
			const source = await response.text()
			const specifiers = [
				...source.matchAll(/^import[^'"]*from\s*['"]([^'"]+)['"]/gm),
			].map((match) => match[1])
			const bareSpecifiers = specifiers.filter(
				(specifier) => !specifier.startsWith('.') && !specifier.startsWith('/'),
			)
			assert.ok(
				bareSpecifiers.length > 0,
				`${moduleUrl} imports nothing bare — the assertion below would be vacuous`,
			)
			for (const specifier of bareSpecifiers) {
				const scope = Object.entries(scopes).find(([prefix]) =>
					moduleUrl.startsWith(prefix),
				)?.[1]
				assert.ok(
					scope?.[specifier],
					`${moduleUrl} imports "${specifier}", which no import map scope resolves`,
				)
			}
		}
	})
})

describe("a served entry's own imports", () => {
	it('can every one be resolved by the browser', async () => {
		// The guard for a type-only module like
		// `app/features/guidelines/tab-id.ts`: a browser entry may import a
		// *type* from a file the asset server does not serve, because
		// `verbatimModuleSyntax` erases `import type` outright. Turn one of
		// those into a value import and the compiled entry gains a relative
		// specifier that resolves to nothing — which is this assertion.
		// Verified by doing it. Note it takes a *runtime* use to trip: an
		// import used only under `typeof` is still a type position, so it is
		// erased too and nothing breaks.
		//
		// Resolution is two steps, and checking only the first is misleading:
		// a relative specifier in compiled output is *not* fingerprinted, so
		// fetching it directly 404s under fingerprinting. The browser resolves
		// it against the importing module's URL and then rewrites it through
		// the document import map, whose top-level `imports` maps each plain
		// asset path to its hashed URL. So the real question is whether the
		// resolved path is a key in that map.
		let relativeSpecifiersSeen = 0

		for (const path of PAGES) {
			const body = await fetchPage(path)
			const { imports } = importMapOf(body)
			const moduleUrls = [
				...new Set(
					[...body.matchAll(/"moduleUrl":"([^"]+)"/g)].map((match) => match[1]),
				),
			]
			assert.ok(moduleUrls.length > 0, `${path} rendered no client entries`)

			for (const moduleUrl of moduleUrls) {
				const entry = await router.fetch(`http://localhost${moduleUrl}`)
				assert.equal(entry.status, 200, moduleUrl)
				const source = await entry.text()

				// Anchored to a real import statement. Unanchored, this also
				// matches a string literal that happens to contain `from
				// './…'`, which survives compilation and would fail the test
				// over a specifier no module imports. (Comments would not —
				// the asset server strips them.)
				const relativeSpecifiers = [
					...source.matchAll(/^import[^'"]*from\s*['"](\.[^'"]+)['"]/gm),
				].map((match) => match[1])
				relativeSpecifiersSeen += relativeSpecifiers.length

				for (const specifier of relativeSpecifiers) {
					const resolved = new URL(
						specifier,
						new URL(moduleUrl, 'http://localhost/'),
					).pathname
					const mapped = imports[resolved]
					assert.ok(
						mapped,
						`${moduleUrl} imports "${specifier}" (${resolved}), which the document import map does not resolve`,
					)
					const response = await router.fetch(`http://localhost${mapped}`)
					assert.equal(response.status, 200, mapped)
				}
			}
		}

		// Without this the loop that *is* the test could run zero times and
		// still pass — the third time this suite needed such a guard.
		assert.ok(
			relativeSpecifiersSeen > 0,
			'no client entry imported anything relative; the assertions above never ran',
		)
	})
})

describe('fingerprinted asset URLs', () => {
	// This process does not watch (no NODE_ENV=development, no REMIX_NODE_HMR),
	// so it fingerprints — the same configuration production runs, which is why
	// the suite exercises it rather than a dev-only one.
	it('serves content-hashed URLs with immutable caching', async () => {
		// Assert the precondition rather than relying on it, the way the HMR
		// test below does. With `NODE_ENV=development` inherited, the server
		// watches instead of fingerprinting: these two tests would fail
		// confusingly, and the suite would quietly stop covering the production
		// asset configuration at all.
		assert.notEqual(
			process.env.NODE_ENV,
			'development',
			'this suite must run the non-watching (production) asset configuration',
		)

		const href = await assetHref('app/entry.ts')
		assert.match(
			href,
			/entry\.@[\w-]+\.ts$/,
			`expected a fingerprinted URL, got ${href}`,
		)

		const response = await router.fetch(new URL(href, 'http://localhost/'))
		assert.equal(response.status, 200)
		assert.equal(
			response.headers.get('cache-control'),
			'public, max-age=31536000, immutable',
		)
	})

	it('does not serve the un-hashed path at all', async () => {
		// Stricter than "serves it with no-cache": in fingerprint mode the plain
		// path is simply not a route. That is what makes `assetHref()` the only
		// safe way to name an asset — a hard-coded `/assets/...` string works in
		// development and 404s in production.
		const response = await router.fetch('http://localhost/assets/app/entry.ts')
		assert.equal(response.status, 404)
	})
})

describe('asset server access boundary', () => {
	it('serves the app modules the browser needs', async () => {
		for (const source of [
			'app/entry.ts',
			'app/components/layout/sidebar.component.ts',
			'app/lib/browser/scroll-lock.ts',
		]) {
			const response = await router.fetch(
				new URL(await assetHref(source), 'http://localhost/'),
			)
			assert.equal(response.status, 200, source)
		}
	})

	// These two assert on `access` — the rule that fired — rather than on
	// `status`. `status` is `missing` for any path with no file behind it,
	// whatever the globs say, so a `status` assertion over a hypothetical path
	// passes no matter what the config does. `access` is decided from the globs
	// alone, so it answers the question without planting files in the repo.
	it('denies a test file even inside a served browser directory', async () => {
		// `app/lib/browser/**` is an allowed *directory*, so a test sitting next
		// to the helper it covers would be public on the strength of its path
		// alone — measured `reachable` before `denyFiles` existed.
		const { access } = await remixAssetServer.getAssetDetails(
			'app/lib/browser/scroll-lock.test.ts',
		)
		assert.equal(access?.allowed, false)
		assert.equal(
			access?.deniedBy,
			'**/*.test.*',
			'the deny rule, not a missing allow, must be what refuses it',
		)
	})

	it('allows a nested browser helper, not just the directory root', async () => {
		// Recursive on purpose: non-recursive, a helper one level down
		// typechecks and imports fine on the server, then 404s in the browser.
		const nested = await remixAssetServer.getAssetDetails(
			'app/lib/browser/nested/helper.ts',
		)
		assert.equal(nested.access?.allowed, true)

		// Control, so the assertion above cannot pass by accident: the same
		// shape of path outside the allowed globs is not allowed.
		const outside = await remixAssetServer.getAssetDetails(
			'app/lib/nowhere/helper.ts',
		)
		assert.equal(outside.access?.allowed, false)
	})

	it('refuses server-only sources, which allowFiles does not cover', async () => {
		for (const source of [
			'app/router.ts',
			'app/lib/session.ts',
			'app/lib/remix-assets.test.ts',
			'package.json',
		]) {
			const details = await remixAssetServer.getAssetDetails(source)
			assert.notEqual(
				details.status,
				'reachable',
				`${source} is reachable through the asset server`,
			)
		}
	})

	it('ships no HMR instrumentation when browser HMR is off', async () => {
		// `REMIX_NODE_HMR` is unset in this process, as it is under `npm start`
		// and `node --test`, so the `uiHmr` loader and the HMR channel are both
		// off. Dev tooling reaching production is the regression this guards:
		// the client is pulled in by `import.meta.hot` boundaries the loader
		// adds, so a served module carrying either means it was instrumented.
		assert.notEqual(
			process.env.REMIX_NODE_HMR,
			'1',
			'this test is meaningless under HMR supervision',
		)
		const page = await fetchPage('/')
		assert.doesNotMatch(page, /ui-hmr\/runtime\/browser/)

		// Component modules only. `uiHmr()` instruments those and nothing else:
		// measured against a live supervised dev server, `theme-toggle.component.ts`
		// came back with 10 instrumentation markers while `app/entry.ts` and
		// `app/lib/browser/scroll-lock.ts` had none. Asserting over a module that is
		// never instrumented either way would pass whatever this gate did.
		for (const source of [
			'app/components/navigation/theme-toggle.component.ts',
			'app/features/portfolio/portfolio-list-frame.component.ts',
		]) {
			const response = await router.fetch(
				new URL(await assetHref(source), 'http://localhost/'),
			)
			const body = await response.text()
			assert.doesNotMatch(body, /import\.meta\.hot/, source)
			assert.doesNotMatch(body, /__remixCreateHotContext/, source)
			assert.doesNotMatch(body, /__uiHmrBrowserRuntime__/, source)
		}
	})

	it('no longer serves client entries from their old static-file paths', async () => {
		for (const path of [
			'/entry.js',
			'/components/layout/sidebar.component.ts',
			'/lib/browser/scroll-lock.ts',
		]) {
			const response = await router.fetch(`http://localhost${path}`)
			assert.equal(response.status, 404, `GET ${path}`)
		}
	})
})
