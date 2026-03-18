import { createElement } from 'remix/component'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { html } from 'remix/html-template'
// @ts-expect-error Runtime-only JS client entry module
import { CatalogPasteInteractions } from '../features/catalog/catalog-paste.component.js'
// @ts-expect-error Runtime-only JS client entry module
import { EtfCardInteractions } from '../features/portfolio/etf-card.component.js'
import type { SessionData } from '../lib/session.ts'
import { routes } from '../routes.ts'
import { AppTopBar } from './app-top-bar.tsx'
// @ts-expect-error Runtime-only JS client entry module
import { SidebarInteractions } from './sidebar.component.js'
import { Sidebar } from './sidebar.tsx'
// @ts-expect-error Runtime-only JS client entry module
import { ThemeToggleInteractions } from './theme-toggle.component.js'
import { ThemeToggleButton } from './theme-toggle.tsx'

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

export async function appTopBar(session: SessionData | null) {
	const markup = await renderToString(jsx(AppTopBar, { session }))
	return html.raw`${markup}`
}

export async function appSidebar(
	session: SessionData | null,
	currentPage: 'portfolio' | 'guidelines' | 'catalog',
) {
	const markup = await renderToString(
		jsx(Sidebar, { navLinks: NAV_LINKS, currentPage, session }),
	)
	return html.raw`${markup}`
}

export async function themeToggleButton() {
	const markup = await renderToString(jsx(ThemeToggleButton, {}))
	return html.raw`${markup}`
}

export async function pageShell(
	title: string,
	session: SessionData | null,
	currentPage: 'portfolio' | 'guidelines' | 'catalog',
	body: ReturnType<typeof html>,
): Promise<ReturnType<typeof html>> {
	const sidebarInteractions = await renderToString(
		createElement(SidebarInteractions, {}),
	)
	const themeToggleInteractions = await renderToString(
		createElement(ThemeToggleInteractions, {}),
	)
	const etfCardInteractions = await renderToString(
		createElement(EtfCardInteractions, {}),
	)
	const catalogPasteInteractions =
		currentPage === 'catalog'
			? await renderToString(createElement(CatalogPasteInteractions, {}))
			: ''

	return html`
    <!doctype html>
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${title}</title>
        <script>if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')</script>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
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
        </script>
        <style type="text/tailwindcss">
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
        </style>
        <script type="importmap">
          {
            "imports": {
              "remix/component": "/remix/dist/component.js",
              "remix/interaction": "/remix/dist/interaction.js",
              "@remix-run/component": "/@remix-run/component/dist/index.js",
              "@remix-run/interaction": "/@remix-run/interaction/dist/index.js"
            }
          }
        </script>
      </head>
      <body class="min-h-screen bg-background font-sans text-foreground antialiased">
        ${await appSidebar(session, currentPage)}
        ${await appTopBar(session)}
        <div class="p-4">
          ${body}
        </div>
        ${html.raw`${sidebarInteractions}`}
        ${html.raw`${themeToggleInteractions}`}
        ${html.raw`${etfCardInteractions}`}
        ${html.raw`${catalogPasteInteractions}`}
        <script type="module">
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
        </script>
      </body>
    </html>
  `
}
