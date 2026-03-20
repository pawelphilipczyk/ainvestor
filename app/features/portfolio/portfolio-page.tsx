import type { Handle } from 'remix/component'
import {
	FieldLabel,
	NumberInput,
	TextareaInput,
} from '../../components/index.ts'
import { SessionProvider } from '../../components/session-provider.tsx'
import type { EtfEntry } from '../../lib/gist.ts'
import { routes } from '../../routes.ts'
import { AddEtfForm, ListFragment } from './add-etf-form/index.ts'
// @ts-expect-error Runtime-only JS client entry module
import { EtfCardInteractions } from './etf-card.component.js'

type PortfolioPageProps = {
	entries: EtfEntry[]
}

/**
 * Portfolio page main content: CSV import (primary), list, optional manual add form,
 * and advice form. Session from SessionProvider context.
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
							Paste or upload a broker CSV to add what you already hold or want
							to buy.
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

					<section
						class="mt-6 rounded-lg border border-primary/25 bg-primary/5 p-4 shadow-sm"
						aria-labelledby="portfolio-import-heading"
					>
						<h2
							id="portfolio-import-heading"
							class="text-lg font-semibold tracking-tight text-card-foreground"
						>
							Import from CSV
						</h2>
						<p class="mt-1 text-xs text-muted-foreground">
							eMAKLER/mBank exports and similar. Example columns:
						</p>
						<pre class="mt-2 overflow-x-auto rounded border border-border/80 bg-card px-3 py-2 text-xs text-muted-foreground">
							{`Papier;Giełda;Liczba dostępna (Blokady);Kurs;Waluta;Wartość;Waluta
IBTA LN ETF;GBR-LSE;186;5.9320;USD;4087.48;PLN`}
						</pre>
						<p class="mt-2 text-xs text-muted-foreground">
							Semicolon or comma. Polish headers (Papier, Giełda, Liczba
							dostępna, Wartość, Waluta). Windows-1250 encoding supported for
							file uploads.
						</p>
						<form
							method="post"
							action={routes.portfolio.import.href()}
							enctype="multipart/form-data"
							class="mt-4 grid gap-4"
							data-fetch-submit
							data-fragment-id="portfolio-list"
							data-fragment-url="/fragments/portfolio-list"
						>
							<div class="grid gap-2">
								<FieldLabel fieldId="portfolioCsvPaste">
									Paste CSV here
								</FieldLabel>
								<TextareaInput
									id="portfolioCsvPaste"
									name="portfolioCsvPaste"
									placeholder="Paste rows from your export (include the header row)…"
									rows={6}
								/>
							</div>
							<div class="grid gap-2">
								<FieldLabel fieldId="portfolioCsv">Or upload a file</FieldLabel>
								<input
									id="portfolioCsv"
									name="portfolioCsv"
									type="file"
									accept=".csv,text/csv"
									class="cursor-pointer text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:opacity-90"
								/>
							</div>
							<button
								type="submit"
								class="justify-self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								Import
							</button>
						</form>
					</section>

					<div id="portfolio-list">
						<ListFragment entries={props.entries} />
					</div>

					<details class="mt-6 rounded-lg border border-border bg-muted/20 p-4">
						<summary class="cursor-pointer text-sm font-medium text-card-foreground outline-none marker:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
							Add one ETF manually
						</summary>
						<AddEtfForm />
					</details>

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
							data-fetch-submit
							data-replace-main
						>
							<FieldLabel fieldId="cashAmount" variant="screenReader">
								Available cash (USD)
							</FieldLabel>
							<div class="flex-1 min-w-0">
								<NumberInput
									id="cashAmount"
									name="cashAmount"
									placeholder="e.g. 1000"
									required={true}
									min={1}
									step="any"
								/>
							</div>
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
