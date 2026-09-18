import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { router } from '../router.ts'
import { assetHref, remixAssetServer } from './remix-assets.ts'

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

async function fetchPage(path: string): Promise<string> {
	const response = await router.fetch(`http://localhost${path}`)
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

describe('asset server access boundary', () => {
	it('serves the app modules the browser needs', async () => {
		for (const source of [
			'app/entry.js',
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
		// came back with 10 instrumentation markers while `app/entry.js` and
		// `app/lib/browser/scroll-lock.ts` had none. Asserting over a module that is
		// never instrumented either way would pass whatever this gate did.
		for (const source of [
			'app/components/navigation/theme-toggle.component.ts',
			'app/features/portfolio/portfolio-list-frame.component.js',
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
