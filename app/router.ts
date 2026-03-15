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
      ? html`<p class="mt-4 text-sm text-slate-500">No ETFs added yet.</p>`
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
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>AI Investor</title>
        <meta name="description" content="Track ETFs you have or want to buy with Remix 3." />
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="min-h-screen bg-slate-50 p-4 font-sans text-slate-900">
        <main class="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <header>
            <h1 class="text-2xl font-bold tracking-tight text-slate-900">AI Investor</h1>
            <p class="mt-1 text-sm text-slate-500">Add ETF names you already hold or want to buy.</p>
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
