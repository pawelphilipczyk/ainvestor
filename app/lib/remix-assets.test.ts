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
			'app/components/layout/sidebar.component.js',
			'app/lib/scroll-lock.js',
		]) {
			const response = await router.fetch(
				new URL(await assetHref(source), 'http://localhost/'),
			)
			assert.equal(response.status, 200, source)
		}
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

	it('no longer serves client entries from their old static-file paths', async () => {
		for (const path of [
			'/entry.js',
			'/components/layout/sidebar.component.js',
			'/lib/scroll-lock.js',
		]) {
			const response = await router.fetch(`http://localhost${path}`)
			assert.equal(response.status, 404, `GET ${path}`)
		}
	})
})
