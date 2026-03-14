import { createRouter } from 'remix/fetch-router'
import { formData } from 'remix/form-data-middleware'
import { html } from 'remix/html-template'
import { logger } from 'remix/logger-middleware'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'

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
  return createHtmlResponse(html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>AI Investor</title>
        <meta
          name="description"
          content="Track ETFs you have or want to buy with Remix 3."
        />
        <style>
          :root {
            color-scheme: light;
            font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          }
          body {
            margin: 0;
            background: #f8fafc;
            color: #0f172a;
            padding: 1rem;
          }
          main {
            max-width: 36rem;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 1rem;
          }
          h1 {
            margin: 0;
            font-size: 1.5rem;
          }
          p {
            margin: 0.5rem 0 0;
            color: #475569;
          }
          form {
            margin-top: 1.25rem;
            display: grid;
            gap: 0.75rem;
          }
          label {
            display: block;
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 0.25rem;
          }
          input,
          select,
          button {
            font: inherit;
            width: 100%;
            box-sizing: border-box;
            border-radius: 8px;
            border: 1px solid #cbd5e1;
            padding: 0.6rem 0.75rem;
          }
          button {
            background: #0f172a;
            border-color: #0f172a;
            color: #ffffff;
            font-weight: 600;
          }
          ul {
            list-style: none;
            margin: 1rem 0 0;
            padding: 0;
            display: grid;
            gap: 0.5rem;
          }
          li {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 0.6rem 0.75rem;
            display: flex;
            justify-content: space-between;
            gap: 0.5rem;
          }
          .badge {
            border-radius: 9999px;
            background: #e2e8f0;
            color: #334155;
            font-size: 0.75rem;
            padding: 0.2rem 0.5rem;
            white-space: nowrap;
          }
          .muted {
            margin-top: 1rem;
            color: #64748b;
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>AI Investor</h1>
          <p>Add ETF names you already hold or want to buy.</p>

          <form method="post" action="${routes.addEtf.href()}">
            <div>
              <label for="etfName">ETF Name</label>
              <input
                id="etfName"
                name="etfName"
                type="text"
                required
                placeholder="e.g. VTI"
                autocomplete="off"
              />
            </div>

            <div>
              <label for="status">Status</label>
              <select id="status" name="status">
                <option value="have">Have</option>
                <option value="want_to_buy">Want to Buy</option>
              </select>
            </div>

            <button type="submit">Add ETF</button>
          </form>

          ${etfEntries.length === 0
            ? html`<p class="muted">No ETFs added yet.</p>`
            : html`<ul>
                ${etfEntries.map(
                  entry => html`<li>
                    <strong>${entry.name}</strong>
                    <span class="badge">${entry.status === 'have' ? 'Have' : 'Want to Buy'}</span>
                  </li>`,
                )}
              </ul>`}
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
