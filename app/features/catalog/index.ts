import { html } from 'remix/html-template'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs } from '../../lib/gist.ts'
import type { SessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { getGuestEntries } from '../portfolio/index.ts'
import {
	ETF_TYPES,
	formatValue,
	getSessionData,
	pageShell,
} from '../shared/index.ts'
import type { CatalogEntry } from './lib.ts'
import {
	fetchCatalog,
	mergeBankIntoCatalog,
	parseBankJsonToCatalog,
	saveCatalog,
} from './lib.ts'

// ---------------------------------------------------------------------------
// Guest state
// ---------------------------------------------------------------------------
let guestCatalog: CatalogEntry[] = []

export function resetGuestCatalog() {
	guestCatalog = []
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const catalogController = {
	async index(context: { request: Request; session: Session }) {
		const url = new URL(context.request.url)
		const typeFilter = url.searchParams.get('type') ?? ''
		const query = url.searchParams.get('q') ?? ''

		const session = getSessionData(context.session)
		const [catalog, entries] = await Promise.all([
			session?.gistId
				? fetchCatalog(session.token, session.gistId)
				: guestCatalog,
			session?.gistId
				? fetchEtfs(session.token, session.gistId)
				: getGuestEntries(),
		])

		return renderCatalogPage(catalog, entries, session, typeFilter, query)
	},

	async import(context: { request: Request; session: Session }) {
		let json: unknown
		try {
			const text = await context.request.text()
			json = text ? JSON.parse(text) : null
		} catch {
			return createRedirectResponse(routes.catalog.index.href())
		}

		const imported = parseBankJsonToCatalog(json)
		if (imported.length === 0)
			return createRedirectResponse(routes.catalog.index.href())

		const session = getSessionData(context.session)
		const existing = session?.gistId
			? await fetchCatalog(session.token, session.gistId)
			: guestCatalog
		const merged = mergeBankIntoCatalog(existing, imported)

		if (session?.gistId) {
			await saveCatalog(session.token, session.gistId, merged)
		} else {
			guestCatalog = merged
		}

		return createRedirectResponse(routes.catalog.index.href())
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
async function renderCatalogPage(
	catalog: CatalogEntry[],
	holdings: EtfEntry[],
	session: SessionData | null,
	typeFilter: string,
	query: string,
) {
	const holdingsByTicker = new Map(
		holdings.map((e) => [e.name.toUpperCase(), e]),
	)

	const filtered = catalog.filter((entry) => {
		const matchesType = !typeFilter || entry.type === typeFilter
		const lq = query.toLowerCase()
		const matchesQuery =
			!query ||
			entry.ticker.toLowerCase().includes(lq) ||
			entry.name.toLowerCase().includes(lq) ||
			entry.description.toLowerCase().includes(lq)
		return matchesType && matchesQuery
	})

	const ownedInCatalog = filtered.filter((e) => holdingsByTicker.has(e.ticker))
	const restOfCatalog = filtered.filter((e) => !holdingsByTicker.has(e.ticker))

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
                  ${ownedInCatalog.map((e) => catalogRow(e, holdingsByTicker.get(e.ticker)))}
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
                    ${restOfCatalog.map((e) => catalogRow(e))}
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
            <p class="mt-1">Paste bank API JSON above to add ETFs to your catalog.</p>
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
                ${ETF_TYPES.map((t) => `<option value="${t}"${typeFilter === t ? ' selected' : ''}>${t.replace('_', ' ')}</option>`).join('')}
              </select>
            </div>
            <button
              type="submit"
              class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Filter
            </button>
            ${
							typeFilter || query
								? html`<a href="${routes.catalog.index.href()}" class="h-9 inline-flex items-center rounded-md px-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Clear</a>`
								: html``
						}
          </form>
        `
			: html``

	const storageNote = session
		? html`<p class="mt-0.5 text-xs text-muted-foreground">Catalog saved to your private GitHub Gist.</p>`
		: html`<p class="mt-0.5 text-xs text-muted-foreground">Sign in to persist catalog across sessions.</p>`

	const body = html`
    <main class="mx-auto max-w-5xl rounded-xl border border-border bg-card p-6 shadow-sm">
      <header>
        <h1 class="text-2xl font-bold tracking-tight text-card-foreground">ETF Catalog</h1>
        <p class="mt-1 text-sm text-muted-foreground">Import your broker's ETF list and browse what's available.</p>
        ${storageNote}
      </header>

      <section class="mt-6">
        <h2 class="text-base font-semibold tracking-tight text-card-foreground">Import</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Paste bank API JSON below to add ETFs (merges with existing).
        </p>
        <div
          data-catalog-paste-zone
          data-import-url="${routes.catalog.import.href()}"
          class="mt-3"
        >
          <label for="pasteZone" class="sr-only">Paste bank API JSON</label>
          <textarea
            id="pasteZone"
            rows="3"
            placeholder="Paste fetch response JSON here (Ctrl+V) — imports on paste"
            class="block w-full max-w-xl rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          ></textarea>
        </div>
        ${emptyCatalogHint}
      </section>

      ${filterForm}
      ${holdingsSection}
      ${allCatalogSection}
    </main>
  `

	return createHtmlResponse(
		await pageShell('AI Investor – ETF Catalog', session, 'catalog', body),
	)
}
