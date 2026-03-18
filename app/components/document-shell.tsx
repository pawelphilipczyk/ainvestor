import type { Handle, RemixNode } from 'remix/component'
// @ts-expect-error Runtime-only JS client entry module
import { CatalogPasteInteractions } from '../features/catalog/catalog-paste.component.js'
// @ts-expect-error Runtime-only JS client entry module
import { EtfCardInteractions } from '../features/portfolio/etf-card.component.js'
import { baseCss } from '../lib/document-styles.ts'
import type { SessionData } from '../lib/session.ts'
import { tailwindConfig } from '../lib/tailwind-config.ts'
import { AppTopBar } from './app-top-bar.tsx'
// @ts-expect-error Runtime-only JS client entry module
import { SidebarInteractions } from './sidebar.component.js'
import { Sidebar } from './sidebar.tsx'
import { NAV_LINKS } from './sidebar-nav.ts'
// @ts-expect-error Runtime-only JS client entry module
import { ThemeToggleInteractions } from './theme-toggle.component.js'

const RUN_SCRIPT = `
import { run } from 'remix/component'

run(document, {
  async loadModule(moduleUrl, exportName) {
    const mod = await import(moduleUrl)
    const loaded = mod[exportName]
    if (typeof loaded !== 'function') {
      throw new Error('Missing export ' + exportName + ' from ' + moduleUrl)
    }
    return loaded
  },
})
`

const IMPORT_MAP = JSON.stringify({
	imports: {
		'remix/component': '/remix/dist/component.js',
		'remix/interaction': '/remix/dist/interaction.js',
		'@remix-run/component': '/@remix-run/component/dist/index.js',
		'@remix-run/interaction': '/@remix-run/interaction/dist/index.js',
	},
})

type DocumentShellProps = {
	title: string
	session: SessionData | null
	currentPage: 'portfolio' | 'guidelines' | 'catalog'
	children: RemixNode
}

export function DocumentShell(_handle: Handle, _setup?: unknown) {
	return (props: DocumentShellProps) => (
		<html lang="en" class="dark">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<title>{props.title}</title>
				<script innerHTML="if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')" />
				<script src="https://cdn.tailwindcss.com" />
				<script
					innerHTML={`tailwind.config = ${JSON.stringify(tailwindConfig)}`}
				/>
				<style type="text/tailwindcss" innerHTML={baseCss} />
				<script type="importmap" innerHTML={IMPORT_MAP} />
			</head>
			<body class="min-h-screen bg-background font-sans text-foreground antialiased">
				<Sidebar
					navLinks={NAV_LINKS}
					currentPage={props.currentPage}
					session={props.session}
				/>
				<AppTopBar session={props.session} />
				<div class="p-4">{props.children}</div>
				<SidebarInteractions />
				<ThemeToggleInteractions />
				<EtfCardInteractions />
				{props.currentPage === 'catalog' ? <CatalogPasteInteractions /> : null}
				<script type="module" innerHTML={RUN_SCRIPT} />
			</body>
		</html>
	)
}
