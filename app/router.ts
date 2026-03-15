import { createRouter } from 'remix/fetch-router'
import { formData } from 'remix/form-data-middleware'
import { html } from 'remix/html-template'
import { logger } from 'remix/logger-middleware'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'

import { renderComponent } from './components/render.ts'
import { routes } from './routes.ts'

type EtfStatus = 'have' | 'want_to_buy'

type EtfEntry = {
  name: string
  status: EtfStatus
}

let etfEntries: EtfEntry[] = []

export function resetEtfEntries() {
  etfEntries = []
}

export let router = createRouter({
  middleware: process.env.NODE_ENV === 'development' ? [logger(), formData()] : [formData()],
})

function renderPage() {
  const etfNameInput = renderComponent('text-input', {
    id: 'etfName',
    label: 'ETF Name',
    field_name: 'etfName',
    placeholder: 'e.g. VTI',
  })

  const statusSelect = renderComponent('select-input', {
    id: 'status',
    label: 'Status',
    field_name: 'status',
    children: '<option value="have">Have</option><option value="want_to_buy">Want to Buy</option>',
  })

  const addButton = renderComponent('submit-button', { children: 'Add ETF' })

  const listContent =
    etfEntries.length === 0
      ? html`<p class="mt-4 text-sm text-muted-foreground">No ETFs added yet.</p>`
      : html`<ul class="mt-4 grid gap-2">
          ${etfEntries.map(entry => {
            const badge = renderComponent('badge', {
              children: entry.status === 'have' ? 'Have' : 'Want to Buy',
            })
            return renderComponent('etf-card', { name: entry.name, badge: String(badge) })
          })}
        </ul>`

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
          <header class="flex items-start justify-between">
            <div>
              <h1 class="text-2xl font-bold tracking-tight text-card-foreground">AI Investor</h1>
              <p class="mt-1 text-sm text-muted-foreground">Add ETF names you already hold or want to buy.</p>
            </div>
          </header>

          <form method="post" action="${routes.addEtf.href()}" class="mt-6 grid gap-4">
            ${etfNameInput}
            ${statusSelect}
            ${addButton}
          </form>

          ${listContent}
        </main>
      </body>
    </html>
  `)
}

router.get(routes.home, () => renderPage())

router.get(routes.health, () => {
  return new Response('ok', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
})

router.post(routes.addEtf, context => {
  let form = context.formData
  if (!form) {
    return createRedirectResponse(routes.home.href())
  }
  let rawName = form.get('etfName')
  let rawStatus = form.get('status')

  let name = typeof rawName === 'string' ? rawName.trim() : ''
  let status: EtfStatus = rawStatus === 'want_to_buy' ? 'want_to_buy' : 'have'

  if (name.length > 0) {
    etfEntries = [{ name, status }, ...etfEntries]
  }

  return createRedirectResponse(routes.home.href())
})
