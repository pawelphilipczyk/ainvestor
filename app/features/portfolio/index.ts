import { object, parseSafe, string } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { html } from 'remix/html-template'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'

import { renderComponent } from '../../components/render.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs, saveEtfs } from '../../lib/gist.ts'
import type { SessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { formatValue, getSessionData, pageShell } from '../shared/index.ts'

const CreateEtfSchema = object({
	etfName: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
})

// ---------------------------------------------------------------------------
// Guest state
// ---------------------------------------------------------------------------
let guestEntries: EtfEntry[] = []

export function resetEtfEntries() {
	guestEntries = []
}

export function getGuestEntries(): EtfEntry[] {
	return guestEntries
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const portfolioController = {
	async index(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const entries = session?.gistId
			? await fetchEtfs(session.token, session.gistId)
			: guestEntries
		return renderPage(entries, session)
	},

	async create(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.portfolio.index.href())

		const raw = Object.fromEntries(
			form as unknown as Iterable<[string, FormDataEntryValue]>,
		)
		if (typeof raw.value === 'string') {
			raw.value = raw.value.replace(/,/g, '')
		}

		const result = parseSafe(CreateEtfSchema, raw)
		if (!result.success) {
			return createRedirectResponse(routes.portfolio.index.href())
		}

		const { etfName: name, value, currency } = result.value
		const session = getSessionData(context.session)
		const current = session?.gistId
			? await fetchEtfs(session.token, session.gistId)
			: guestEntries

		const normalizedName = name.toLowerCase()
		const normalizedCurrency = currency.toUpperCase()
		const existingIndex = current.findIndex(
			(e) =>
				e.name.toLowerCase() === normalizedName &&
				e.currency.toUpperCase() === normalizedCurrency,
		)
		const entry: EtfEntry =
			existingIndex >= 0
				? {
						...current[existingIndex],
						value: current[existingIndex].value + value,
					}
				: { id: crypto.randomUUID(), name, value, currency: normalizedCurrency }

		const updated =
			existingIndex >= 0
				? current.map((e, i) => (i === existingIndex ? entry : e))
				: [entry, ...current]

		if (session?.gistId) {
			await saveEtfs(session.token, session.gistId, updated)
		} else {
			guestEntries = updated
		}

		return createRedirectResponse(routes.portfolio.index.href())
	},

	async delete(context: {
		request: Request
		session: Session
		params: unknown
	}) {
		const id = (context.params as Record<string, string>).id
		if (!id) return createRedirectResponse(routes.portfolio.index.href())

		const session = getSessionData(context.session)

		if (session?.gistId) {
			const current = await fetchEtfs(session.token, session.gistId)
			await saveEtfs(
				session.token,
				session.gistId,
				current.filter((e) => e.id !== id),
			)
		} else {
			guestEntries = guestEntries.filter((e) => e.id !== id)
		}

		return createRedirectResponse(routes.portfolio.index.href())
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
async function renderPage(entries: EtfEntry[], session: SessionData | null) {
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
			'USD',
			'EUR',
			'GBP',
			'CHF',
			'PLN',
			'JPY',
			'CAD',
			'AUD',
			'SEK',
			'NOK',
		]
			.map(
				(c) =>
					`<option value="${c}"${c === 'PLN' ? ' selected' : ''}>${c}</option>`,
			)
			.join(''),
	})

	const addButton = renderComponent('submit-button', { children: 'Add ETF' })

	const listContent =
		entries.length === 0
			? html`<p class="mt-4 text-sm text-muted-foreground">No ETFs added yet.</p>`
			: html`<ul class="mt-4 grid gap-2">
          ${entries.map((entry) => {
						const badge = renderComponent(
							'badge',
							{
								children: formatValue(entry.value, entry.currency),
							},
							import.meta.url,
						)
						return renderComponent(
							'etf-card',
							{
								name: entry.name,
								badge: String(badge),
								dialog_id: `dialog-${entry.id}`,
								delete_href: routes.portfolio.delete.href({ id: entry.id }),
							},
							import.meta.url,
						)
					})}
        </ul>`

	const storageNote = session
		? html`<p class="mt-1 text-xs text-muted-foreground">Saved to your private GitHub Gist</p>`
		: html`<p class="mt-1 text-xs text-muted-foreground">
        Sign in to persist your data across sessions
      </p>`

	const body = html`
    <main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
      <header>
        <h1 class="text-2xl font-bold tracking-tight text-card-foreground">AI Investor</h1>
        <p class="mt-1 text-sm text-muted-foreground">Add ETF names you already hold or want to buy.</p>
        ${storageNote}
      </header>

      <form method="post" action="${routes.portfolio.create.href()}" class="mt-6 grid gap-4">
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
        <h2 class="text-lg font-semibold tracking-tight">Get Advice</h2>
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
  `

	return createHtmlResponse(
		await pageShell('AI Investor', session, 'portfolio', body),
		{
			headers: { 'Cache-Control': 'no-store' },
		},
	)
}
