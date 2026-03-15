import { createRouter } from 'remix/fetch-router'
import { formData } from 'remix/form-data-middleware'
import { html } from 'remix/html-template'
import { logger } from 'remix/logger-middleware'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'

import { renderComponent } from './components/render.ts'
import { fetchEtfs, findOrCreateGist, saveEtfs } from './lib/gist.ts'
import type { EtfEntry } from './lib/gist.ts'
import { fetchGuidelines, saveGuidelines } from './lib/guidelines.ts'
import type { EtfGuideline, EtfType } from './lib/guidelines.ts'
import { fetchCatalog, saveCatalog, parseCsvToCatalog } from './lib/catalog.ts'
import type { CatalogEntry } from './lib/catalog.ts'
import { clearSessionCookie, createSessionCookie, parseSessionCookie } from './lib/session.ts'
import type { SessionData } from './lib/session.ts'
import { createDefaultClient, getInvestmentAdvice } from './openai.ts'
import type { AdviceClient } from './openai.ts'
import { routes } from './routes.ts'

// ---------------------------------------------------------------------------
// Config helpers (read at request time so env vars can be set in tests)
// ---------------------------------------------------------------------------
function getClientId() { return process.env.GH_CLIENT_ID ?? '' }
function getClientSecret() { return process.env.GH_CLIENT_SECRET ?? '' }
function getSessionSecret() { return process.env.SESSION_SECRET ?? 'dev-secret-change-me' }

// ---------------------------------------------------------------------------
// In-memory fallback (used when user is not logged in, preserved for tests)
// ---------------------------------------------------------------------------
let guestEntries: EtfEntry[] = []
let guestGuidelines: EtfGuideline[] = []
let guestCatalog: CatalogEntry[] = []
let adviceClient: AdviceClient | null = null

export function resetEtfEntries() {
  guestEntries = []
}

export function resetGuestGuidelines() {
  guestGuidelines = []
}

export function resetGuestCatalog() {
  guestCatalog = []
}

export function setAdviceClient(client: AdviceClient | null) {
  adviceClient = client
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSession(request: Request): Promise<SessionData | null> {
  const cookie = request.headers.get('cookie') ?? undefined
  return parseSessionCookie(cookie, getSessionSecret())
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export let router = createRouter({
  middleware: process.env.NODE_ENV === 'development' ? [logger(), formData()] : [formData()],
})

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------
router.get(routes.home, async context => {
  const session = await getSession(context.request)
  const entries = session ? await fetchEtfs(session.token, session.gistId!) : guestEntries
  return renderPage(entries, session)
})

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
router.get(routes.health, () => {
  return new Response('ok', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
})

// ---------------------------------------------------------------------------
// POST /etfs
// ---------------------------------------------------------------------------
router.post(routes.addEtf, async context => {
  const form = context.formData
  if (!form) return createRedirectResponse(routes.home.href())

  const name = typeof form.get('etfName') === 'string' ? (form.get('etfName') as string).trim() : ''
  const rawValue = form.get('value')
  const currency = typeof form.get('currency') === 'string' ? (form.get('currency') as string).trim().toUpperCase() : 'USD'
  const value = typeof rawValue === 'string' ? parseFloat(rawValue.replace(/,/g, '')) : NaN

  if (name.length === 0 || isNaN(value) || value < 0) {
    return createRedirectResponse(routes.home.href())
  }

  const entry = { id: crypto.randomUUID(), name, value, currency }
  const session = await getSession(context.request)

  if (session) {
    const current = await fetchEtfs(session.token, session.gistId!)
    await saveEtfs(session.token, session.gistId!, [entry, ...current])
  } else {
    guestEntries = [entry, ...guestEntries]
  }

  return createRedirectResponse(routes.home.href())
})

// ---------------------------------------------------------------------------
// GET /auth/github  — redirect to GitHub OAuth
// ---------------------------------------------------------------------------
router.get(routes.githubLogin, () => {
  const clientId = getClientId()
  if (!clientId) {
    return new Response('GH_CLIENT_ID is not configured', { status: 500 })
  }
  const params = new URLSearchParams({ client_id: clientId, scope: 'gist' })
  return createRedirectResponse(`https://github.com/login/oauth/authorize?${params}`)
})

// ---------------------------------------------------------------------------
// GET /auth/github/callback  — exchange code for token, set session cookie
// ---------------------------------------------------------------------------
router.get(routes.githubCallback, async context => {
  const url = new URL(context.request.url)
  const code = url.searchParams.get('code')
  if (!code) return createRedirectResponse(routes.home.href())

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code,
    }),
  })

  if (!tokenRes.ok) return createRedirectResponse(routes.home.href())
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string }
  const token = tokenData.access_token
  if (!token) return createRedirectResponse(routes.home.href())

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  const user = (await userRes.json()) as { login: string }

  const gistId = await findOrCreateGist(token)

  const sessionCookie = await createSessionCookie(
    { token, gistId, login: user.login },
    getSessionSecret(),
  )

  return new Response(null, {
    status: 302,
    headers: {
      Location: routes.home.href(),
      'Set-Cookie': sessionCookie,
    },
  })
})

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
router.post(routes.logout, () => {
  return new Response(null, {
    status: 302,
    headers: {
      Location: routes.home.href(),
      'Set-Cookie': clearSessionCookie(),
    },
  })
})

// ---------------------------------------------------------------------------
// GET /guidelines
// ---------------------------------------------------------------------------
router.get(routes.guidelines, async context => {
  const session = await getSession(context.request)
  const guidelines = session
    ? await fetchGuidelines(session.token, session.gistId!)
    : guestGuidelines
  return renderGuidelinesPage(guidelines, session)
})

// ---------------------------------------------------------------------------
// POST /guidelines
// ---------------------------------------------------------------------------
router.post(routes.addGuideline, async context => {
  const form = context.formData
  if (!form) return createRedirectResponse(routes.guidelines.href())

  const etfName = typeof form.get('etfName') === 'string'
    ? (form.get('etfName') as string).trim()
    : ''
  const rawPct = form.get('targetPct')
  const targetPct = typeof rawPct === 'string' ? parseFloat(rawPct) : NaN
  const etfType = (form.get('etfType') as EtfType | null) ?? 'equity'

  if (!etfName || isNaN(targetPct) || targetPct <= 0 || targetPct > 100) {
    return createRedirectResponse(routes.guidelines.href())
  }

  const entry: EtfGuideline = { id: crypto.randomUUID(), etfName, targetPct, etfType }
  const session = await getSession(context.request)

  if (session) {
    const current = await fetchGuidelines(session.token, session.gistId!)
    await saveGuidelines(session.token, session.gistId!, [entry, ...current])
  } else {
    guestGuidelines = [entry, ...guestGuidelines]
  }

  return createRedirectResponse(routes.guidelines.href())
})

// ---------------------------------------------------------------------------
// POST /guidelines/:id/delete
// ---------------------------------------------------------------------------
router.post(routes.deleteGuideline, async context => {
  const id = (context.params as Record<string, string>).id
  if (!id) return createRedirectResponse(routes.guidelines.href())

  const session = await getSession(context.request)

  if (session) {
    const current = await fetchGuidelines(session.token, session.gistId!)
    await saveGuidelines(session.token, session.gistId!, current.filter(g => g.id !== id))
  } else {
    guestGuidelines = guestGuidelines.filter(g => g.id !== id)
  }

  return createRedirectResponse(routes.guidelines.href())
})

// ---------------------------------------------------------------------------
// POST /advice
// ---------------------------------------------------------------------------
router.post(routes.advice, async context => {
  const form = context.formData
  if (!form) {
    return new Response('Bad request', { status: 400 })
  }

  const rawCash = form.get('cashAmount')
  const cashAmount = typeof rawCash === 'string' ? rawCash.trim() : ''
  if (!cashAmount) {
    return new Response('cashAmount is required', { status: 400 })
  }

  const session = await getSession(context.request)
  const entries = session ? await fetchEtfs(session.token, session.gistId!) : guestEntries
  const guidelines = session
    ? await fetchGuidelines(session.token, session.gistId!)
    : guestGuidelines

  const client = adviceClient ?? createDefaultClient()
  const advice = await getInvestmentAdvice(entries, guidelines, cashAmount, client)

  return createHtmlResponse(html`
    <!doctype html>
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>AI Investor – Advice</title>
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
      <body class="min-h-screen bg-background p-4 font-sans text-foreground antialiased">
        <main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 class="text-2xl font-bold tracking-tight">Investment Advice</h1>
          <p class="mt-1 text-sm text-muted-foreground">Based on your portfolio and $${cashAmount} available.</p>
          <div class="mt-6 whitespace-pre-wrap text-sm leading-relaxed">${advice}</div>
          <a href="${routes.home.href()}" class="mt-6 inline-block text-sm underline underline-offset-4">← Back to portfolio</a>
        </main>
      </body>
    </html>
  `)
})

// ---------------------------------------------------------------------------
// GET /catalog
// ---------------------------------------------------------------------------
router.get(routes.catalog, async context => {
  const url = new URL(context.request.url)
  const typeFilter = url.searchParams.get('type') ?? ''
  const query = url.searchParams.get('q') ?? ''

  const session = await getSession(context.request)
  const [catalog, entries] = await Promise.all([
    session ? fetchCatalog(session.token, session.gistId!) : guestCatalog,
    session ? fetchEtfs(session.token, session.gistId!) : guestEntries,
  ])

  return renderCatalogPage(catalog, entries, session, typeFilter, query)
})

// ---------------------------------------------------------------------------
// POST /catalog/import
// ---------------------------------------------------------------------------
router.post(routes.importCatalog, async context => {
  const form = context.formData
  if (!form) return createRedirectResponse(routes.catalog.href())

  const file = form.get('csvFile')
  if (!file || typeof file === 'string') return createRedirectResponse(routes.catalog.href())

  const csvText = await (file as Blob).text()
  const imported = parseCsvToCatalog(csvText)
  if (imported.length === 0) return createRedirectResponse(routes.catalog.href())

  const session = await getSession(context.request)
  if (session) {
    await saveCatalog(session.token, session.gistId!, imported)
  } else {
    guestCatalog = imported
  }

  return createRedirectResponse(routes.catalog.href())
})

// ---------------------------------------------------------------------------
// Page renderers
// ---------------------------------------------------------------------------
const ETF_TYPES: EtfType[] = ['equity', 'bond', 'real_estate', 'commodity', 'mixed', 'money_market']

function renderGuidelinesPage(guidelines: EtfGuideline[], session: SessionData | null) {
  const totalPct = guidelines.reduce((sum, g) => sum + g.targetPct, 0)
  const remaining = Math.max(0, 100 - totalPct)

  const listContent =
    guidelines.length === 0
      ? html`<p class="mt-4 text-sm text-muted-foreground">No guidelines added yet.</p>`
      : html`<ul class="mt-4 grid gap-2">
          ${guidelines.map(g => html`
            <li class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div class="flex items-center gap-3">
                <span class="font-medium">${g.etfName}</span>
                <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">${g.etfType}</span>
              </div>
              <div class="flex items-center gap-4">
                <span class="text-sm font-semibold">${g.targetPct}%</span>
                <form method="post" action="${routes.deleteGuideline.href({ id: g.id })}">
                  <button
                    type="submit"
                    class="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete ${g.etfName} guideline"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          `)}
        </ul>`

  return createHtmlResponse(html`
    <!doctype html>
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>AI Investor – Guidelines</title>
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
      <body class="min-h-screen bg-background p-4 font-sans text-foreground antialiased">
        <main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
          <header class="flex items-center justify-between gap-4">
            <div>
              <h1 class="text-2xl font-bold tracking-tight text-card-foreground">Investment Guidelines</h1>
              <p class="mt-1 text-sm text-muted-foreground">
                Set your target allocation. ${session ? 'Saved to your private GitHub Gist.' : 'Sign in to persist across sessions.'}
              </p>
            </div>
            <a href="${routes.home.href()}" class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground shrink-0">
              ← Portfolio
            </a>
          </header>

          <form method="post" action="${routes.addGuideline.href()}" class="mt-6 grid gap-4">
            <div class="grid gap-2">
              <label for="etfName" class="text-sm font-medium">ETF / Asset Name</label>
              <input
                id="etfName"
                name="etfName"
                type="text"
                required
                placeholder="e.g. VTI"
                class="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="grid gap-2">
                <label for="targetPct" class="text-sm font-medium">Target %</label>
                <input
                  id="targetPct"
                  name="targetPct"
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  required
                  placeholder="e.g. 60"
                  class="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div class="grid gap-2">
                <label for="etfType" class="text-sm font-medium">Type</label>
                <select
                  id="etfType"
                  name="etfType"
                  class="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  ${ETF_TYPES.map(t => `<option value="${t}">${t.replace('_', ' ')}</option>`).join('')}
                </select>
              </div>
            </div>
            <button
              type="submit"
              class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Add Guideline
            </button>
          </form>

          <div class="mt-6 flex items-center justify-between text-xs text-muted-foreground">
            <span>Total allocated: <strong class="text-foreground">${totalPct}%</strong></span>
            <span>Remaining: <strong class="text-foreground">${remaining}%</strong></span>
          </div>

          ${listContent}
        </main>
        <script type="module">
          const el = document.querySelector('[data-island="theme-toggle"]')
          if (el) {
            el.addEventListener('click', () => {
              const isDark = document.documentElement.classList.toggle('dark')
              localStorage.setItem('theme', isDark ? 'dark' : 'light')
            })
          }
        </script>
      </body>
    </html>
  `)
}

function formatValue(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

// Shared HTML head/body shell so each page stays consistent.
function pageShell(title: string, body: ReturnType<typeof html>): ReturnType<typeof html> {
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
      <body class="min-h-screen bg-background p-4 font-sans text-foreground antialiased">
        ${body}
        <script type="module">
          const el = document.querySelector('[data-island="theme-toggle"]')
          if (el) {
            el.addEventListener('click', () => {
              const isDark = document.documentElement.classList.toggle('dark')
              localStorage.setItem('theme', isDark ? 'dark' : 'light')
            })
          }
        </script>
      </body>
    </html>
  `
}

function themeToggleButton() {
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

function renderCatalogPage(
  catalog: CatalogEntry[],
  holdings: EtfEntry[],
  session: SessionData | null,
  typeFilter: string,
  query: string,
) {
  const holdingsByTicker = new Map(holdings.map(e => [e.name.toUpperCase(), e]))

  const filtered = catalog.filter(entry => {
    const matchesType = !typeFilter || entry.type === typeFilter
    const lq = query.toLowerCase()
    const matchesQuery =
      !query ||
      entry.ticker.toLowerCase().includes(lq) ||
      entry.name.toLowerCase().includes(lq) ||
      entry.description.toLowerCase().includes(lq)
    return matchesType && matchesQuery
  })

  const ownedInCatalog = filtered.filter(e => holdingsByTicker.has(e.ticker))
  const restOfCatalog = filtered.filter(e => !holdingsByTicker.has(e.ticker))

  const tableHeaderRow = html`
    <tr class="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <th class="pb-2 pr-4">Ticker</th>
      <th class="pb-2 pr-4">Name</th>
      <th class="pb-2 pr-4">Type</th>
      <th class="pb-2 pr-4">Description</th>
      <th class="pb-2 pr-4">ISIN</th>
      <th class="pb-2">Value</th>
    </tr>
  `

  function catalogRow(entry: CatalogEntry, holding?: EtfEntry) {
    const valueCell = holding
      ? html`<td class="py-2 pr-4 text-sm font-medium text-foreground">${formatValue(holding.value, holding.currency)}</td>`
      : html`<td class="py-2 pr-4 text-sm text-muted-foreground">—</td>`

    return html`
      <tr class="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
        <td class="py-2 pr-4 font-mono text-sm font-semibold">${entry.ticker}</td>
        <td class="py-2 pr-4 text-sm">${entry.name}</td>
        <td class="py-2 pr-4">
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">${entry.type.replace('_', ' ')}</span>
        </td>
        <td class="py-2 pr-4 text-sm text-muted-foreground max-w-xs truncate">${entry.description || '—'}</td>
        <td class="py-2 pr-4 font-mono text-xs text-muted-foreground">${entry.isin ?? '—'}</td>
        ${valueCell}
      </tr>
    `
  }

  const holdingsSection =
    ownedInCatalog.length === 0
      ? html``
      : html`
          <section class="mt-6">
            <h2 class="text-base font-semibold tracking-tight text-card-foreground">Your Holdings</h2>
            <p class="mt-0.5 text-xs text-muted-foreground">ETFs in this catalog that you already own.</p>
            <div class="mt-3 overflow-x-auto rounded-lg border border-border">
              <table class="w-full table-auto border-collapse">
                <thead class="bg-muted/40 px-4">
                  <tr><td colspan="6" class="h-1"></td></tr>
                  ${tableHeaderRow}
                </thead>
                <tbody>
                  ${ownedInCatalog.map(e => catalogRow(e, holdingsByTicker.get(e.ticker)))}
                </tbody>
              </table>
            </div>
          </section>
        `

  const allCatalogSection =
    restOfCatalog.length === 0 && ownedInCatalog.length === 0
      ? html`<p class="mt-4 text-sm text-muted-foreground">No ETFs match your search.</p>`
      : restOfCatalog.length === 0
        ? html``
        : html`
            <section class="mt-6">
              <h2 class="text-base font-semibold tracking-tight text-card-foreground">
                ${ownedInCatalog.length > 0 ? 'Other Available ETFs' : 'Available ETFs'}
              </h2>
              <p class="mt-0.5 text-xs text-muted-foreground">${restOfCatalog.length} ETF${restOfCatalog.length === 1 ? '' : 's'} listed.</p>
              <div class="mt-3 overflow-x-auto rounded-lg border border-border">
                <table class="w-full table-auto border-collapse">
                  <thead class="bg-muted/40">
                    <tr><td colspan="6" class="h-1"></td></tr>
                    ${tableHeaderRow}
                  </thead>
                  <tbody>
                    ${restOfCatalog.map(e => catalogRow(e))}
                  </tbody>
                </table>
              </div>
            </section>
          `

  const emptyCatalogHint =
    catalog.length === 0
      ? html`
          <div class="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p class="font-medium text-foreground">No catalog imported yet.</p>
            <p class="mt-1">Upload a CSV file from your broker above. Expected columns:</p>
            <pre class="mt-2 overflow-x-auto rounded bg-background px-3 py-2 text-xs">ticker,name,type,description,isin
VTI,"Vanguard Total Stock Market ETF",equity,"Broad US market",US9229087690
BND,"Vanguard Total Bond Market ETF",bond,"US bond market",US9229088443</pre>
            <p class="mt-2 text-xs">Column order is flexible. <code>ticker</code> and <code>name</code> are required.
            Type aliases: <em>asset class</em>, <em>category</em>. Ticker aliases: <em>symbol</em>, <em>code</em>.</p>
          </div>
        `
      : html``

  const filterForm =
    catalog.length > 0
      ? html`
          <form method="get" action="${routes.catalog.href()}" class="mt-5 flex flex-wrap items-end gap-3">
            <div class="grid gap-1.5">
              <label for="q" class="text-xs font-medium text-muted-foreground">Search</label>
              <input
                id="q"
                name="q"
                type="search"
                value="${query}"
                placeholder="Ticker, name, or description…"
                class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-64"
              />
            </div>
            <div class="grid gap-1.5">
              <label for="type" class="text-xs font-medium text-muted-foreground">Type</label>
              <select
                id="type"
                name="type"
                class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All types</option>
                ${ETF_TYPES.map(t => `<option value="${t}"${typeFilter === t ? ' selected' : ''}>${t.replace('_', ' ')}</option>`).join('')}
              </select>
            </div>
            <button
              type="submit"
              class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Filter
            </button>
            ${typeFilter || query
              ? html`<a href="${routes.catalog.href()}" class="h-9 inline-flex items-center rounded-md px-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Clear</a>`
              : html``}
          </form>
        `
      : html``

  const storageNote = session
    ? html`<p class="mt-0.5 text-xs text-muted-foreground">Catalog saved to your private GitHub Gist.</p>`
    : html`<p class="mt-0.5 text-xs text-muted-foreground">Sign in to persist catalog across sessions.</p>`

  const body = html`
    <main class="mx-auto max-w-5xl rounded-xl border border-border bg-card p-6 shadow-sm">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-card-foreground">ETF Catalog</h1>
          <p class="mt-1 text-sm text-muted-foreground">Import your broker's ETF list and browse what's available.</p>
          ${storageNote}
        </div>
        <div class="flex shrink-0 items-center gap-3 mt-1">
          <a href="${routes.home.href()}" class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground shrink-0">
            ← Portfolio
          </a>
          ${themeToggleButton()}
        </div>
      </header>

      <section class="mt-6">
        <h2 class="text-base font-semibold tracking-tight text-card-foreground">Import CSV</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Importing a new CSV replaces the current catalog (${catalog.length} ETF${catalog.length === 1 ? '' : 's'} stored).
        </p>
        <form
          method="post"
          action="${routes.importCatalog.href()}"
          enctype="multipart/form-data"
          class="mt-3 flex flex-wrap items-center gap-3"
        >
          <label class="sr-only" for="csvFile">CSV file</label>
          <input
            id="csvFile"
            name="csvFile"
            type="file"
            accept=".csv,text/csv"
            required
            class="text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
          />
          <button
            type="submit"
            class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Import
          </button>
        </form>
        ${emptyCatalogHint}
      </section>

      ${filterForm}
      ${holdingsSection}
      ${allCatalogSection}
    </main>
  `

  return createHtmlResponse(pageShell('AI Investor – ETF Catalog', body))
}

function renderPage(entries: EtfEntry[], session: SessionData | null) {
  const etfNameInput = renderComponent('text-input', {
    id: 'etfName',
    label: 'ETF Name',
    field_name: 'etfName',
    placeholder: 'e.g. VTI',
  })

  const valueInput = renderComponent('text-input', {
    id: 'value',
    label: 'Value',
    field_name: 'value',
    placeholder: 'e.g. 1200.50',
  })

  const currencySelect = renderComponent('select-input', {
    id: 'currency',
    label: 'Currency',
    field_name: 'currency',
    children: [
      'USD', 'EUR', 'GBP', 'CHF', 'PLN', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK',
    ].map(c => `<option value="${c}">${c}</option>`).join(''),
  })

  const addButton = renderComponent('submit-button', { children: 'Add ETF' })

  const listContent =
    entries.length === 0
      ? html`<p class="mt-4 text-sm text-muted-foreground">No ETFs added yet.</p>`
      : html`<ul class="mt-4 grid gap-2">
          ${entries.map(entry => {
            const badge = renderComponent('badge', {
              children: formatValue(entry.value, entry.currency),
            })
            return renderComponent('etf-card', { name: entry.name, badge: String(badge) })
          })}
        </ul>`

  const authSection = session
    ? html`
        <div class="flex items-center gap-3">
          <span class="text-sm text-muted-foreground">@${session.login}</span>
          <form method="post" action="${routes.logout.href()}">
            <button
              type="submit"
              class="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      `
    : html`
        <a
          href="${routes.githubLogin.href()}"
          class="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
          Sign in with GitHub
        </a>
      `

  const storageNote = session
    ? html`<p class="mt-1 text-xs text-muted-foreground">Saved to your private GitHub Gist</p>`
    : html`<p class="mt-1 text-xs text-muted-foreground">
        Sign in to persist your data across sessions
      </p>`

  return createHtmlResponse(html`
    <!doctype html>
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>AI Investor</title>
        <meta name="description" content="Track ETFs you have or want to buy with Remix 3." />
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
      <body class="min-h-screen bg-background p-4 font-sans text-foreground antialiased">
        <main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
          <header class="flex items-start justify-between gap-4">
            <div>
              <h1 class="text-2xl font-bold tracking-tight text-card-foreground">AI Investor</h1>
              <p class="mt-1 text-sm text-muted-foreground">Add ETF names you already hold or want to buy.</p>
              ${storageNote}
            </div>
            <div class="flex shrink-0 items-center gap-2 mt-1">
              ${authSection}
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
            </div>
          </header>

          <form method="post" action="${routes.addEtf.href()}" class="mt-6 grid gap-4">
            ${etfNameInput}
            <div class="grid grid-cols-2 gap-3">
              ${valueInput}
              ${currencySelect}
            </div>
            ${addButton}
          </form>

          ${listContent}

          <hr class="my-6 border-border" />

          <section>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold tracking-tight">Get Advice</h2>
              <div class="flex items-center gap-4">
                <a
                  href="${routes.catalog.href()}"
                  class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  ETF catalog
                </a>
                <a
                  href="${routes.guidelines.href()}"
                  class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Manage guidelines
                </a>
              </div>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">Tell me how much cash you have and I'll suggest what to buy next.</p>
            <form method="post" action="${routes.advice.href()}" class="mt-4 flex gap-2">
              <label for="cashAmount" class="sr-only">Available cash (USD)</label>
              <input
                id="cashAmount"
                name="cashAmount"
                type="number"
                min="1"
                step="any"
                required
                placeholder="e.g. 1000"
                class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="submit"
                class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ask AI
              </button>
            </form>
          </section>
        </main>
        <script type="module">
          const el = document.querySelector('[data-island="theme-toggle"]')
          if (el) {
            el.addEventListener('click', () => {
              const isDark = document.documentElement.classList.toggle('dark')
              localStorage.setItem('theme', isDark ? 'dark' : 'light')
            })
          }
        </script>
      </body>
    </html>
  `)
}
