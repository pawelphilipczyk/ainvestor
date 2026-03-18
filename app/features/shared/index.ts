import { createElement } from 'remix/component'
import { renderToString } from 'remix/component/server'
import { html } from 'remix/html-template'
import type { Session } from 'remix/session'
import { renderComponent } from '../../components/render.ts'
// @ts-expect-error Runtime-only JS client entry module
import { SidebarInteractions } from '../../components/sidebar.component.js'
// @ts-expect-error Runtime-only JS client entry module
import { ThemeToggleInteractions } from '../../components/theme-toggle.component.js'
import { ThemeToggleButton } from '../../components/theme-toggle.tsx'
import { isPreview } from '../../lib/gist.ts'
import type { EtfType } from '../../lib/guidelines.ts'
import type { SessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
// @ts-expect-error Runtime-only JS client entry module
import { CatalogPasteInteractions } from '../catalog/catalog-paste.component.js'
// @ts-expect-error Runtime-only JS client entry module
import { EtfCardInteractions } from '../portfolio/etf-card.component.js'

// ---------------------------------------------------------------------------
// Config helpers (read at request time so env vars can be set in tests)
// ---------------------------------------------------------------------------
export function getClientId() {
	return process.env.GH_CLIENT_ID ?? ''
}
export function getClientSecret() {
	return process.env.GH_CLIENT_SECRET ?? ''
}

// ---------------------------------------------------------------------------
// Session helper: read typed session data from the middleware-injected Session
// ---------------------------------------------------------------------------
export function getSessionData(session: Session): SessionData | null {
	const token = session.get('token') as string | undefined
	const login = session.get('login') as string | undefined
	if (!token || !login) return null
	return {
		token,
		gistId: (session.get('gistId') as string | undefined) ?? null,
		login,
	}
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
export const ETF_TYPES: EtfType[] = [
	'equity',
	'bond',
	'real_estate',
	'commodity',
	'mixed',
	'money_market',
]

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function formatValue(value: number, currency: string): string {
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
			maximumFractionDigits: 2,
		}).format(value)
	} catch {
		return `${value} ${currency}`
	}
}

// ---------------------------------------------------------------------------
// Shared navigation components
// ---------------------------------------------------------------------------
export async function appTopBar(session: SessionData | null) {
	const authIndicator = session
		? html`<span class="hidden text-xs font-medium text-muted-foreground sm:inline">@${session.login}</span>`
		: html``
	const themeToggle = await themeToggleButton()
	return html`
    <div class="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background px-4 py-2.5">
      <div class="flex items-center gap-3">
        <button
          data-sidebar-toggle
          type="button"
          aria-label="Open navigation"
          aria-expanded="false"
          aria-controls="app-sidebar"
          class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="20" y2="18"/>
          </svg>
        </button>
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-foreground">AI Investor</span>
          ${isPreview() ? html`<span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/30 dark:text-amber-400" role="status">Preview</span>` : html``}
        </div>
      </div>
      <div class="flex items-center gap-3">
        ${authIndicator}
        ${themeToggle}
      </div>
    </div>
  `
}

export function appSidebar(
	session: SessionData | null,
	currentPage: 'portfolio' | 'guidelines' | 'catalog',
) {
	const navLinks: Array<{
		href: string
		label: string
		page: 'portfolio' | 'guidelines' | 'catalog'
	}> = [
		{
			href: routes.portfolio.index.href(),
			label: 'Portfolio',
			page: 'portfolio',
		},
		{
			href: routes.catalog.index.href(),
			label: 'ETF Catalog',
			page: 'catalog',
		},
		{
			href: routes.guidelines.index.href(),
			label: 'Investment Guidelines',
			page: 'guidelines',
		},
	]

	const navItems = navLinks.map((link) => {
		const isCurrent = link.page === currentPage
		const ariaCurrent = isCurrent ? html.raw`aria-current="page"` : html.raw``
		return html`
      <a
        href="${link.href}"
        class="flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${isCurrent ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}"
        ${ariaCurrent}
      >
        ${link.label}
      </a>
    `
	})

	const authAction = session
		? html`
        <div class="border-t border-border pt-4">
          <p class="mb-2 px-3 text-xs text-muted-foreground">Signed in as @${session.login}</p>
          <form method="post" action="${routes.auth.logout.href()}">
            <button
              type="submit"
              class="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      `
		: html`
        <div class="border-t border-border pt-4">
          <a
            href="${routes.auth.login.href()}"
            class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            Sign in with GitHub
          </a>
        </div>
      `

	return renderComponent('sidebar', {
		nav_items: navItems.map(String).join(''),
		auth_action: String(authAction),
	})
}

// ---------------------------------------------------------------------------
// Shared HTML shell
// ---------------------------------------------------------------------------
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
        ${appSidebar(session, currentPage)}
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

export async function themeToggleButton() {
	const markup = await renderToString(createElement(ThemeToggleButton, {}))
	return html.raw`${markup}`
}
