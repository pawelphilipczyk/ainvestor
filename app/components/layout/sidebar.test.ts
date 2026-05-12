import * as assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { jsx } from 'remix/ui/jsx-runtime'
import { renderToString } from 'remix/ui/server'
import type { AppPage } from '../../lib/app-page.ts'
import type { SessionData } from '../../lib/session.ts'
import { router } from '../../router.ts'
import { SessionProvider } from './session-provider.tsx'
import { Sidebar } from './sidebar.tsx'
import { getNavLinks, type NavLink } from './sidebar-nav.ts'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

function renderSidebarWithSession(
	navLinks: NavLink[],
	currentPage: AppPage,
	session: SessionData | null,
) {
	return renderToString(
		jsx(SessionProvider, {
			session,
			children: jsx(Sidebar, { navLinks, currentPage }),
		}),
	)
}

describe('sidebar component', () => {
	it('sidebar.tsx exists in app/components/layout/', () => {
		const filePath = join(componentsDir, 'sidebar.tsx')
		assert.ok(existsSync(filePath), 'sidebar.tsx must exist')
	})

	it('Sidebar renders with nav links', async () => {
		const result = await renderSidebarWithSession(
			getNavLinks(),
			'portfolio',
			null,
		)
		assert.match(result, /id="app-sidebar"/)
		assert.match(result, /id="sidebar-backdrop"/)
		assert.match(result, /href="\/portfolio"/)
		assert.match(result, /href="\/advice"/)
		assert.match(result, /href="\/catalog"/)
		assert.match(result, /href="\/guidelines"/)
		assert.doesNotMatch(result, /href="\/admin\/etf-import"/)
	})

	it('Sidebar renders Admin in the lower navigation group for admins', async () => {
		const result = await renderSidebarWithSession(
			getNavLinks({ isAdmin: true }),
			'admin',
			{
				login: 'catalog-admin',
				token: 'tok',
				gistId: 'gist-1',
				isAdmin: true,
			},
		)

		assert.match(
			result,
			/<div[^>]*data-sidebar-secondary-nav[^>]*>[\s\S]*href="\/admin\/etf-import"[\s\S]*<\/div>/,
		)
		assert.match(result, /aria-current="page"[^>]*>Admin/)
	})

	it('Sidebar hides Admin for signed-in non-admin users', async () => {
		const result = await renderSidebarWithSession(
			getNavLinks({ isAdmin: false }),
			'portfolio',
			{
				login: 'alice',
				token: 'tok',
				gistId: 'gist-1',
			},
		)

		assert.doesNotMatch(result, /href="\/admin\/etf-import"/)
		assert.doesNotMatch(result, />Admin</)
	})

	it('Sidebar is pinned open at md breakpoint and backdrop is overlay-only below md', async () => {
		const result = await renderSidebarWithSession(
			getNavLinks(),
			'portfolio',
			null,
		)
		assert.match(result, /md:translate-x-0/)
		assert.match(
			result,
			/id="sidebar-backdrop"[^>]*\bmd:hidden\b/,
			'backdrop should hide the overlay at md+',
		)
	})

	it('Sidebar marks the current page with aria-current="page"', async () => {
		const result = await renderSidebarWithSession(
			getNavLinks(),
			'catalog',
			null,
		)
		assert.match(result, /aria-current="page"/)
	})

	it('Sidebar drawer header uses same chrome height as top bar and site name', async () => {
		const result = await renderSidebarWithSession(
			getNavLinks(),
			'portfolio',
			null,
		)
		assert.match(result, /\bmin-h-14\b/)
		assert.match(result, /\bpy-2\.5\b/)
		assert.match(result, /AI Investor/)
	})

	it('Sidebar shows sign-in link with navigation loading when session is null', async () => {
		const result = await renderSidebarWithSession(
			getNavLinks(),
			'portfolio',
			null,
		)
		assert.match(result, /Sign in with GitHub/)
		assert.match(result, /href="\/auth\/github"/)
		assert.match(result, /data-navigation-loading/)
	})

	it('Sidebar shows sign-out form when session is provided', async () => {
		const result = await renderSidebarWithSession(getNavLinks(), 'portfolio', {
			login: 'alice',
			token: 'tok',
			gistId: null,
		})
		assert.match(result, /Sign out/)
		assert.match(result, /@alice/)
	})
})

describe('remix ui runtime in document', () => {
	it('body no longer uses legacy data-island activation attributes', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.doesNotMatch(body, /data-island=/)
	})

	it('document includes import map for remix ui runtime', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /"remix\/ui":\s*"\/remix\/dist\/ui\.js"/)
		assert.match(
			body,
			/"@remix-run\/ui":\s*"\/@remix-run\/ui\/dist\/index\.js"/,
		)
	})

	it('document loads entry.js to boot remix ui runtime', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /<script[^>]*type="module"[^>]*src="\/entry\.js"/)
	})

	it('document offsets main column beside fixed sidebar from md breakpoint', async () => {
		const response = await router.fetch('http://localhost/')
		const body = await response.text()
		assert.match(body, /id="page-content"[^>]*\bmin-w-0\b[^>]*\bmd:ml-64\b/)
	})
	it('GET /entry.js returns bootstrap with run({ loadModule, resolveFrame })', async () => {
		const response = await router.fetch('http://localhost/entry.js')
		assert.equal(response.status, 200)
		const body = await response.text()
		assert.match(body, /import \{ run \} from 'remix\/ui'/)
		assert.match(body, /run\(\{/)
		assert.match(body, /resolveFrame/)
		assert.match(body, /loadModule\(moduleUrl, exportName\)/)
	})
})

describe('sidebar component entry static file', () => {
	it('GET /components/layout/sidebar.component.js returns 200 with javascript content-type', async () => {
		const response = await router.fetch(
			'http://localhost/components/layout/sidebar.component.js',
		)
		assert.equal(response.status, 200)
		assert.match(response.headers.get('content-type') ?? '', /javascript/)
	})

	it('GET /components/sidebar.island.js returns 404 after migration', async () => {
		const response = await router.fetch(
			'http://localhost/components/sidebar.island.js',
		)
		assert.equal(response.status, 404)
	})

	it('sidebar component entry wires document listeners via handle.signal', async () => {
		const response = await router.fetch(
			'http://localhost/components/layout/sidebar.component.js',
		)
		const body = await response.text()
		assert.match(body, /clientEntry/)
		assert.match(body, /from 'remix\/ui'/)
		assert.match(body, /addEventListeners/)
		assert.match(body, /handle\.signal/)
		assert.match(body, /addEventListeners\(doc, handle\.signal/)
	})
})
