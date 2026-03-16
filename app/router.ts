import { createRouter } from 'remix/fetch-router'
import { formData } from 'remix/form-data-middleware'
import { html } from 'remix/html-template'
import { logger } from 'remix/logger-middleware'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'

import { renderComponent } from './components/render.ts'
import { fetchEtfs } from './lib/gist.ts'
import { fetchGuidelines } from './lib/guidelines.ts'
import { fetchCatalog, saveCatalog, parseCsvToCatalog } from './lib/catalog.ts'
import type { CatalogEntry } from './lib/catalog.ts'
import { createDefaultClient, getInvestmentAdvice } from './openai.ts'
import type { AdviceClient } from './openai.ts'
import { routes } from './routes.ts'
import { getSession, ETF_TYPES, formatValue, pageShell, themeToggleButton } from './features/shared/index.ts'
import { authController } from './features/auth/index.ts'
import { portfolioController, resetEtfEntries, getGuestEntries } from './features/portfolio/index.ts'
import { guidelinesController, resetGuestGuidelines, getGuestGuidelines } from './features/guidelines/index.ts'

// ---------------------------------------------------------------------------
// In-memory fallback (used when user is not logged in, preserved for tests)
// ---------------------------------------------------------------------------
let guestCatalog: CatalogEntry[] = []
let adviceClient: AdviceClient | null = null

export { resetEtfEntries }
export { resetGuestGuidelines }

export function resetGuestCatalog() {
  guestCatalog = []
}

export function setAdviceClient(client: AdviceClient | null) {
  adviceClient = client
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export let router = createRouter({
  middleware: process.env.NODE_ENV === 'development' ? [logger(), formData()] : [formData()],
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
// Portfolio routes
// ---------------------------------------------------------------------------
router.map(routes.portfolio, portfolioController)

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
router.map(routes.auth, authController)

// ---------------------------------------------------------------------------
// Guidelines routes
// ---------------------------------------------------------------------------
router.map(routes.guidelines, guidelinesController)

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
  const entries = session ? await fetchEtfs(session.token, session.gistId!) : getGuestEntries()
  const guidelines = session
    ? await fetchGuidelines(session.token, session.gistId!)
    : getGuestGuidelines()

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
          <a href="${routes.portfolio.index.href()}" class="mt-6 inline-block text-sm underline underline-offset-4">← Back to portfolio</a>
        </main>
      </body>
    </html>
  `)
})

// ---------------------------------------------------------------------------
// GET /catalog
// ---------------------------------------------------------------------------
router.get(routes.catalog.index, async context => {
  const url = new URL(context.request.url)
  const typeFilter = url.searchParams.get('type') ?? ''
  const query = url.searchParams.get('q') ?? ''

  const session = await getSession(context.request)
  const [catalog, entries] = await Promise.all([
    session ? fetchCatalog(session.token, session.gistId!) : guestCatalog,
    session ? fetchEtfs(session.token, session.gistId!) : getGuestEntries(),
  ])

  return renderCatalogPage(catalog, entries, session, typeFilter, query)
})

// ---------------------------------------------------------------------------
// POST /catalog/import
// ---------------------------------------------------------------------------
router.post(routes.catalog.import, async context => {
  const form = context.formData
  if (!form) return createRedirectResponse(routes.catalog.index.href())

  const file = form.get('csvFile')
  if (!file || typeof file === 'string') return createRedirectResponse(routes.catalog.index.href())

  const csvText = await (file as Blob).text()
  const imported = parseCsvToCatalog(csvText)
  if (imported.length === 0) return createRedirectResponse(routes.catalog.index.href())

  const session = await getSession(context.request)
  if (session) {
    await saveCatalog(session.token, session.gistId!, imported)
  } else {
    guestCatalog = imported
  }

  return createRedirectResponse(routes.catalog.index.href())
})

// ---------------------------------------------------------------------------
// Page renderers
// ---------------------------------------------------------------------------

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
          <form method="get" action="${routes.catalog.index.href()}" class="mt-5 flex flex-wrap items-end gap-3">
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
              ? html`<a href="${routes.catalog.index.href()}" class="h-9 inline-flex items-center rounded-md px-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Clear</a>`
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
          <a href="${routes.portfolio.index.href()}" class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground shrink-0">
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
          action="${routes.catalog.import.href()}"
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

