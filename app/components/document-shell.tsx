import type { Handle, RemixNode } from 'remix/component'
import type { SessionData } from '../lib/session.ts'
import { routes } from '../routes.ts'
import { AppTopBar } from './app-top-bar.tsx'
import { Sidebar } from './sidebar.tsx'

const NAV_LINKS = [
	{
		href: routes.portfolio.index.href(),
		label: 'Portfolio',
		page: 'portfolio' as const,
	},
	{
		href: routes.catalog.index.href(),
		label: 'ETF Catalog',
		page: 'catalog' as const,
	},
	{
		href: routes.guidelines.index.href(),
		label: 'Investment Guidelines',
		page: 'guidelines' as const,
	},
]

const TAILWIND_CONFIG = `
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(0 84.2% 60.2%)' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
}
`

const BASE_CSS = `
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}
`

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
	sidebarInteractions: string
	themeToggleInteractions: string
	etfCardInteractions: string
	catalogPasteInteractions: string
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
				<script innerHTML={TAILWIND_CONFIG} />
				<style type="text/tailwindcss" innerHTML={BASE_CSS} />
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
				<div innerHTML={props.sidebarInteractions} />
				<div innerHTML={props.themeToggleInteractions} />
				<div innerHTML={props.etfCardInteractions} />
				{props.catalogPasteInteractions ? (
					<div innerHTML={props.catalogPasteInteractions} />
				) : null}
				<script type="module" innerHTML={RUN_SCRIPT} />
			</body>
		</html>
	)
}
