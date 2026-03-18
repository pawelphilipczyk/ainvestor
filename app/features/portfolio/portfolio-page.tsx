import type { Handle } from 'remix/component'
import {
	NumberInput,
	SelectInput,
	SubmitButton,
	TextInput,
} from '../../components/index.ts'
import { SessionProvider } from '../../components/session-provider.tsx'
import { formatValue } from '../../lib/format.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { routes } from '../../routes.ts'
// @ts-expect-error Runtime-only JS client entry module
import { EtfCardInteractions } from './etf-card.component.js'
import { EtfCard } from './etf-card.tsx'

const CURRENCIES = [
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
]

type PortfolioPageProps = {
	entries: EtfEntry[]
}

/**
 * Portfolio page main content: add ETF form, CSV import, list, and advice form.
 * Session from SessionProvider context. EtfCardInteractions co-located here.
 */
export function PortfolioPage(handle: Handle, _setup?: unknown) {
	return (props: PortfolioPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		return (
			<>
				<main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
					<header>
						<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
							AI Investor
						</h1>
						<p class="mt-1 text-sm text-muted-foreground">
							Add ETF names you already hold or want to buy.
						</p>
						{session ? (
							<p class="mt-1 text-xs text-muted-foreground">
								Saved to your private GitHub Gist
							</p>
						) : (
							<p class="mt-1 text-xs text-muted-foreground">
								Sign in to persist your data across sessions
							</p>
						)}
					</header>

					<form
						method="post"
						action={routes.portfolio.create.href()}
						class="mt-6 grid gap-4"
					>
						<TextInput
							id="etfName"
							label="ETF Name"
							fieldName="etfName"
							placeholder="e.g. VTI"
							required={true}
						/>
						<div class="grid grid-cols-2 gap-3">
							<NumberInput
								id="value"
								label="Value"
								fieldName="value"
								placeholder="e.g. 1200.50"
								required={true}
							/>
							<SelectInput
								id="currency"
								label="Currency"
								fieldName="currency"
								options={CURRENCIES.map((c) => ({ value: c, label: c }))}
							/>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<TextInput
								id="exchange"
								label="Exchange (optional)"
								fieldName="exchange"
								placeholder="e.g. GBR-LSE, DEU-XETRA"
							/>
							<NumberInput
								id="quantity"
								label="Quantity (optional)"
								fieldName="quantity"
								placeholder="e.g. 186"
							/>
						</div>
						<SubmitButton>Add ETF</SubmitButton>
					</form>

					<section class="mt-6">
						<h2 class="text-base font-semibold tracking-tight text-card-foreground">
							Import from CSV
						</h2>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Upload an eMAKLER/mBank portfolio export. Supported columns:
						</p>
						<pre class="mt-2 overflow-x-auto rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
							{`Papier;Giełda;Liczba dostępna (Blokady);Kurs;Waluta;Wartość;Waluta
IBTA LN ETF;GBR-LSE;186;5.9320;USD;4087.48;PLN`}
						</pre>
						<p class="mt-1 text-xs text-muted-foreground">
							Semicolon or comma. Polish headers (Papier, Giełda, Liczba
							dostępna, Wartość, Waluta). Windows-1250 encoding supported.
						</p>
						<form
							method="post"
							action={routes.portfolio.import.href()}
							enctype="multipart/form-data"
							class="mt-3 flex flex-wrap items-center gap-3"
						>
							<label class="sr-only" for="portfolioCsv">
								Portfolio CSV
							</label>
							<input
								id="portfolioCsv"
								name="portfolioCsv"
								type="file"
								accept=".csv,text/csv"
								class="cursor-pointer text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:opacity-90"
							/>
							<button
								type="submit"
								class="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								Import
							</button>
						</form>
					</section>

					{props.entries.length === 0 ? (
						<p class="mt-4 text-sm text-muted-foreground">No ETFs added yet.</p>
					) : (
						<ul class="mt-4 grid gap-2">
							{props.entries.map((entry) => {
								const details = [
									entry.quantity !== undefined
										? `${entry.quantity.toLocaleString()} shares`
										: '',
									entry.exchange ?? '',
								]
									.filter(Boolean)
									.join(' · ')
								return (
									<EtfCard
										key={entry.id}
										name={entry.name}
										details={details}
										badgeValue={formatValue(entry.value, entry.currency)}
										dialogId={`dialog-${entry.id}`}
										deleteHref={routes.portfolio.delete.href({ id: entry.id })}
									/>
								)
							})}
						</ul>
					)}

					<hr class="my-6 border-border" />

					<section>
						<h2 class="text-lg font-semibold tracking-tight">Get Advice</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							Tell me how much cash you have and I'll suggest what to buy next.
						</p>
						<form
							method="post"
							action={routes.advice.href()}
							class="mt-4 flex gap-2"
						>
							<label for="cashAmount" class="sr-only">
								Available cash (USD)
							</label>
							<input
								id="cashAmount"
								name="cashAmount"
								type="number"
								min={1}
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
				<EtfCardInteractions />
			</>
		)
	}
}
