import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { object, optional, parseSafe, string } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { html } from 'remix/html-template'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'

import {
	NumberInput,
	SelectInput,
	SubmitButton,
	TextInput,
} from '../../components/index.ts'
import { renderJsx } from '../../components/render.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs, saveEtfs } from '../../lib/gist.ts'
import { decodeCsvBytes, parsePortfolioCsv } from '../../lib/portfolio-csv.ts'
import type { SessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { formatValue, getSessionData, pageShell } from '../shared/index.ts'
import { EtfCard } from './etf-card.tsx'

const CreateEtfSchema = object({
	etfName: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
	exchange: optional(string()),
	quantity: optional(coerce.number().pipe(min(0))),
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
		if (typeof raw.quantity === 'string') {
			raw.quantity = raw.quantity.replace(/,/g, '')
		}

		const result = parseSafe(CreateEtfSchema, raw)
		if (!result.success) {
			return createRedirectResponse(routes.portfolio.index.href())
		}

		const { etfName: name, value, currency, exchange, quantity } = result.value
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
		const existing = existingIndex >= 0 ? current[existingIndex] : null
		const entry: EtfEntry = existing
			? {
					...existing,
					value: existing.value + value,
					quantity:
						existing.quantity !== undefined && quantity !== undefined
							? existing.quantity + quantity
							: (quantity ?? existing.quantity),
					exchange: existing.exchange || exchange || undefined,
				}
			: {
					id: crypto.randomUUID(),
					name,
					value,
					currency: normalizedCurrency,
					...(exchange ? { exchange } : {}),
					...(quantity !== undefined ? { quantity } : {}),
				}

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

	async import(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.portfolio.index.href())

		const file = form.get('portfolioCsv')
		if (!file || typeof file === 'string')
			return createRedirectResponse(routes.portfolio.index.href())

		const bytes = await (file as Blob).arrayBuffer()
		const csvText = decodeCsvBytes(bytes)
		const imported = parsePortfolioCsv(csvText)
		if (imported.length === 0)
			return createRedirectResponse(routes.portfolio.index.href())

		const session = getSessionData(context.session)
		const current = session?.gistId
			? await fetchEtfs(session.token, session.gistId)
			: guestEntries

		// Merge imported with existing (same name+currency: add values, quantity)
		const byKey = new Map<string, EtfEntry>()
		for (const e of current) {
			byKey.set(`${e.name.toLowerCase()}:${e.currency}`, e)
		}
		for (const e of imported) {
			const key = `${e.name.toLowerCase()}:${e.currency}`
			const existing = byKey.get(key)
			if (existing) {
				const quantity =
					existing.quantity !== undefined && e.quantity !== undefined
						? existing.quantity + e.quantity
						: (e.quantity ?? existing.quantity)
				byKey.set(key, {
					...existing,
					value: existing.value + e.value,
					quantity,
					exchange: existing.exchange || e.exchange || undefined,
				})
			} else {
				byKey.set(key, e)
			}
		}
		const updated = Array.from(byKey.values())

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
	const [
		etfNameInput,
		valueInput,
		currencySelect,
		exchangeInput,
		quantityInput,
		addButton,
	] = await Promise.all([
		renderJsx(TextInput, {
			id: 'etfName',
			label: 'ETF Name',
			fieldName: 'etfName',
			placeholder: 'e.g. VTI',
			required: true,
		}),
		renderJsx(NumberInput, {
			id: 'value',
			label: 'Value',
			fieldName: 'value',
			placeholder: 'e.g. 1200.50',
			required: true,
		}),
		renderJsx(SelectInput, {
			id: 'currency',
			label: 'Currency',
			fieldName: 'currency',
			options: [
				'PLN',
				'USD',
				'EUR',
				'GBP',
				'CHF',
				'JPY',
				'CAD',
				'AUD',
				'SEK',
				'NOK',
			].map((c) => ({ value: c, label: c })),
		}),
		renderJsx(TextInput, {
			id: 'exchange',
			label: 'Exchange (optional)',
			fieldName: 'exchange',
			placeholder: 'e.g. GBR-LSE, DEU-XETRA',
		}),
		renderJsx(NumberInput, {
			id: 'quantity',
			label: 'Quantity (optional)',
			fieldName: 'quantity',
			placeholder: 'e.g. 186',
		}),
		renderJsx(SubmitButton, { children: 'Add ETF' }),
	])

	const listContent =
		entries.length === 0
			? html`<p class="mt-4 text-sm text-muted-foreground">No ETFs added yet.</p>`
			: html`<ul class="mt-4 grid gap-2">
          ${await Promise.all(
						entries.map(async (entry) => {
							const details = [
								entry.quantity !== undefined
									? `${entry.quantity.toLocaleString()} shares`
									: '',
								entry.exchange ?? '',
							]
								.filter(Boolean)
								.join(' · ')
							const markup = await renderToString(
								jsx(EtfCard, {
									name: entry.name,
									details,
									badgeValue: formatValue(entry.value, entry.currency),
									dialogId: `dialog-${entry.id}`,
									deleteHref: routes.portfolio.delete.href({ id: entry.id }),
								}),
							)
							return html.raw`${markup}`
						}),
					)}
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
        <div class="grid grid-cols-2 gap-3">
          ${exchangeInput}
          ${quantityInput}
        </div>
        ${addButton}
      </form>

      <section class="mt-6">
        <h2 class="text-base font-semibold tracking-tight text-card-foreground">Import from CSV</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Upload an eMAKLER/mBank portfolio export. Supported columns:
        </p>
        <pre class="mt-2 overflow-x-auto rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Papier;Giełda;Liczba dostępna (Blokady);Kurs;Waluta;Wartość;Waluta
IBTA LN ETF;GBR-LSE;186;5.9320;USD;4087.48;PLN</pre>
        <p class="mt-1 text-xs text-muted-foreground">
          Semicolon or comma. Polish headers (Papier, Giełda, Liczba dostępna, Wartość, Waluta). Windows-1250 encoding supported.
        </p>
        <form
          method="post"
          action="${routes.portfolio.import.href()}"
          enctype="multipart/form-data"
          class="mt-3 flex flex-wrap items-center gap-3"
        >
          <label class="sr-only" for="portfolioCsv">Portfolio CSV</label>
          <input
            id="portfolioCsv"
            name="portfolioCsv"
            type="file"
            accept=".csv,text/csv"
            class="text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
          />
          <button
            type="submit"
            class="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Import
          </button>
        </form>
      </section>

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
