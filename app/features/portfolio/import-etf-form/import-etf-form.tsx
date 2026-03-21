import type { Handle } from 'remix/component'
import { FieldLabel, TextareaInput } from '../../../components/index.ts'
import { routes } from '../../../routes.ts'

/**
 * CSV import form: paste and/or file upload, progressive enhancement for list fragment.
 */
export function ImportEtfForm(_handle: Handle, _setup?: unknown) {
	return () => (
		<section
			class="mt-6 min-w-0 rounded-lg border border-primary/25 bg-primary/5 p-4 shadow-sm"
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
				Semicolon or comma. Polish headers (Papier, Giełda, Liczba dostępna,
				Wartość, Waluta). Windows-1250 encoding supported for file uploads.
			</p>
			<form
				method="post"
				action={routes.portfolio.import.href()}
				enctype="multipart/form-data"
				class="mt-4 grid gap-4"
				data-fetch-submit
				data-fragment-id="portfolio-list"
				data-fragment-url={routes.portfolio.fragmentList.href()}
			>
				<div class="grid gap-2">
					<FieldLabel fieldId="portfolioCsvPaste">Paste CSV here</FieldLabel>
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
	)
}
