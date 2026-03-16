import { html } from 'remix/html-template'
import type { EtfType } from '../../lib/guidelines.ts'
import type { SessionData } from '../../lib/session.ts'
import { parseSessionCookie } from '../../lib/session.ts'
import { routes } from '../../routes.ts'

// ---------------------------------------------------------------------------
// Config helpers (read at request time so env vars can be set in tests)
// ---------------------------------------------------------------------------
export function getClientId() {
	return process.env.GH_CLIENT_ID ?? ''
}
export function getClientSecret() {
	return process.env.GH_CLIENT_SECRET ?? ''
}
export function getSessionSecret() {
	return process.env.SESSION_SECRET ?? 'dev-secret-change-me'
}

// ---------------------------------------------------------------------------
// Session helper
// ---------------------------------------------------------------------------
export function getSession(request: Request): Promise<SessionData | null> {
	const cookie = request.headers.get('cookie') ?? undefined
	return parseSessionCookie(cookie, getSessionSecret())
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
export function appTopBar(session: SessionData | null) {
	const authIndicator = session
		? html`<span class="hidden text-xs font-medium text-muted-foreground sm:inline">@${session.login}</span>`
		: html``
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
        <span class="text-sm font-semibold text-foreground">AI Investor</span>
      </div>
      <div class="flex items-center gap-3">
        ${authIndicator}
        ${themeToggleButton()}
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
		{ href: routes.portfolio.index.href(), label: 'Portfolio', page: 'portfolio' },
		{ href: routes.catalog.index.href(), label: 'ETF Catalog', page: 'catalog' },
		{
			href: routes.guidelines.index.href(),
			label: 'Investment Guidelines',
			page: 'guidelines',
		},
	]

	const navItems = navLinks.map((link) => {
		const isCurrent = link.page === currentPage
		return html`
      <a
        href="${link.href}"
        class="flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${isCurrent ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}"
        ${isCurrent ? 'aria-current="page"' : ''}
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

	return html`
    <div
      id="sidebar-backdrop"
      aria-hidden="true"
      class="fixed inset-0 z-40 bg-black/50 opacity-0 pointer-events-none transition-opacity duration-200"
    ></div>
    <aside
      id="app-sidebar"
      aria-label="Main navigation"
      class="fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-border bg-card transition-transform duration-200 ease-in-out"
    >
      <div class="flex items-center justify-between border-b border-border p-4">
        <span class="text-sm font-semibold text-card-foreground">Navigation</span>
        <button
          data-sidebar-close
          type="button"
          aria-label="Close navigation"
          class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <nav class="flex-1 overflow-y-auto p-4">
        <div class="grid gap-1">
          ${navItems}
        </div>
        <div class="mt-4">
          ${authAction}
        </div>
      </nav>
    </aside>
  `
}

// ---------------------------------------------------------------------------
// Shared HTML shell
// ---------------------------------------------------------------------------
export function pageShell(
	title: string,
	session: SessionData | null,
	currentPage: 'portfolio' | 'guidelines' | 'catalog',
	body: ReturnType<typeof html>,
): ReturnType<typeof html> {
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
      </head>
      <body class="min-h-screen bg-background font-sans text-foreground antialiased">
        ${appSidebar(session, currentPage)}
        ${appTopBar(session)}
        <div class="p-4">
          ${body}
        </div>
        <script type="module">
          const themeToggle = document.querySelector('[data-island="theme-toggle"]')
          if (themeToggle) {
            themeToggle.addEventListener('click', () => {
              const isDark = document.documentElement.classList.toggle('dark')
              localStorage.setItem('theme', isDark ? 'dark' : 'light')
            })
          }

          const sidebarToggle = document.querySelector('[data-sidebar-toggle]')
          const sidebarClose = document.querySelector('[data-sidebar-close]')
          const sidebar = document.getElementById('app-sidebar')
          const backdrop = document.getElementById('sidebar-backdrop')

          function openSidebar() {
            sidebar.classList.remove('-translate-x-full')
            backdrop.classList.remove('opacity-0', 'pointer-events-none')
            backdrop.classList.add('opacity-100')
            sidebarToggle?.setAttribute('aria-expanded', 'true')
            document.body.style.overflow = 'hidden'
          }

          function closeSidebar() {
            sidebar.classList.add('-translate-x-full')
            backdrop.classList.add('opacity-0', 'pointer-events-none')
            backdrop.classList.remove('opacity-100')
            sidebarToggle?.setAttribute('aria-expanded', 'false')
            document.body.style.overflow = ''
          }

          if (sidebarToggle) sidebarToggle.addEventListener('click', openSidebar)
          if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar)
          if (backdrop) backdrop.addEventListener('click', closeSidebar)
          document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar() })
        </script>
      </body>
    </html>
  `
}

export function themeToggleButton() {
	return html`
    <button
      data-island="theme-toggle"
      type="button"
      aria-label="Toggle theme"
      class="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <svg class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
      </svg>
      <svg class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>
  `
}
