import type { Handle } from 'remix/component'
import { SelectInput } from '../../components/index.ts'
import { formatValue } from '../../lib/format.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { ETF_TYPES } from '../../lib/guidelines.ts'
import { routes } from '../../routes.ts'
import type { CatalogEntry } from './lib.ts'

type CatalogPageProps = {
	catalog: CatalogEntry[]
	holdings: EtfEntry[]
	session: { login: string } | null
	typeFilter: string
	query: string
}

const TABLE_HEADER = (
	<tr class="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
		<th class="pb-2 pr-4">Ticker</th>
		<th class="pb-2 pr-4">Name</th>
		<th class="pb-2 pr-4">Type</th>
		<th class="pb-2 pr-4">Description</th>
		<th class="pb-2 pr-4">ISIN</th>
		<th class="pb-2">Value</th>
	</tr>
)

function renderCatalogRow(entry: CatalogEntry, holding?: EtfEntry) {
	const valueCell = holding ? (
		<td class="py-2 pr-4 text-sm font-medium text-foreground">
			{formatValue(holding.value, holding.currency)}
		</td>
	) : (
		<td class="py-2 pr-4 text-sm text-muted-foreground">—</td>
	)

	return (
		<tr
			key={entry.id}
			class="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
		>
			<td class="py-2 pr-4 font-mono text-sm font-semibold">{entry.ticker}</td>
			<td class="py-2 pr-4 text-sm">{entry.name}</td>
			<td class="py-2 pr-4">
				<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
					{entry.type.replace('_', ' ')}
				</span>
			</td>
			<td class="max-w-xs truncate py-2 pr-4 text-sm text-muted-foreground">
				{entry.description || '—'}
			</td>
			<td class="py-2 pr-4 font-mono text-xs text-muted-foreground">
				{entry.isin ?? '—'}
			</td>
			{valueCell}
		</tr>
	)
}

export function CatalogPage(_handle: Handle, _setup?: unknown) {
	return (props: CatalogPageProps) => {
		const holdingsByTicker = new Map(
			props.holdings.map((e) => [e.name.toUpperCase(), e]),
		)

		const filtered = props.catalog.filter((entry) => {
			const matchesType = !props.typeFilter || entry.type === props.typeFilter
			const lq = props.query.toLowerCase()
			const matchesQuery =
				!props.query ||
				entry.ticker.toLowerCase().includes(lq) ||
				entry.name.toLowerCase().includes(lq) ||
				entry.description.toLowerCase().includes(lq)
			return matchesType && matchesQuery
		})

		const ownedInCatalog = filtered.filter((e) =>
			holdingsByTicker.has(e.ticker),
		)
		const restOfCatalog = filtered.filter(
			(e) => !holdingsByTicker.has(e.ticker),
		)

		return (
			<main class="mx-auto max-w-5xl rounded-xl border border-border bg-card p-6 shadow-sm">
				<header>
					<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
						ETF Catalog
					</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Import your broker's ETF list and browse what's available.
					</p>
					{props.session ? (
						<p class="mt-0.5 text-xs text-muted-foreground">
							Catalog saved to your private GitHub Gist.
						</p>
					) : (
						<p class="mt-0.5 text-xs text-muted-foreground">
							Sign in to persist catalog across sessions.
						</p>
					)}
				</header>

				<section class="mt-6">
					<h2 class="text-base font-semibold tracking-tight text-card-foreground">
						Import
					</h2>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Paste bank API JSON below to add ETFs (merges with existing).
					</p>
					<div
						data-catalog-paste-zone
						data-import-url={routes.catalog.import.href()}
						class="mt-3"
					>
						<label for="pasteZone" class="sr-only">
							Paste bank API JSON
						</label>
						<textarea
							id="pasteZone"
							rows={3}
							placeholder="Paste fetch response JSON here (Ctrl+V) — imports on paste"
							class="block w-full max-w-xl rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					{props.catalog.length === 0 ? (
						<div class="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
							<p class="font-medium text-foreground">
								No catalog imported yet.
							</p>
							<p class="mt-1">
								Paste bank API JSON above to add ETFs to your catalog.
							</p>
						</div>
					) : null}
				</section>

				{props.catalog.length > 0 ? (
					<form
						method="get"
						action={routes.catalog.index.href()}
						class="mt-5 flex flex-wrap items-end gap-3"
					>
						<div class="grid gap-1.5">
							<label for="q" class="text-xs font-medium text-muted-foreground">
								Search
							</label>
							<input
								id="q"
								name="q"
								type="search"
								value={props.query}
								placeholder="Ticker, name, or description…"
								class="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
						</div>
						<SelectInput
							id="type"
							label="Type"
							fieldName="type"
							options={[
								{ value: '', label: 'All types' },
								...ETF_TYPES.map((t) => ({
									value: t,
									label: t.replace('_', ' '),
									selected: props.typeFilter === t,
								})),
							]}
						/>
						<button
							type="submit"
							class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Filter
						</button>
						{props.typeFilter || props.query ? (
							<a
								href={routes.catalog.index.href()}
								class="hover:text-foreground inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground underline underline-offset-4"
							>
								Clear
							</a>
						) : null}
					</form>
				) : null}

				{ownedInCatalog.length > 0 ? (
					<section class="mt-6">
						<h2 class="text-base font-semibold tracking-tight text-card-foreground">
							Your Holdings
						</h2>
						<p class="mt-0.5 text-xs text-muted-foreground">
							ETFs in this catalog that you already own.
						</p>
						<div class="mt-3 overflow-x-auto rounded-lg border border-border">
							<table class="w-full table-auto border-collapse">
								<thead class="bg-muted/40 px-4">
									<tr>
										<td colspan={6} class="h-1" />
									</tr>
									{TABLE_HEADER}
								</thead>
								<tbody>
									{ownedInCatalog.map((e) =>
										renderCatalogRow(e, holdingsByTicker.get(e.ticker)),
									)}
								</tbody>
							</table>
						</div>
					</section>
				) : null}

				{restOfCatalog.length === 0 && ownedInCatalog.length === 0 ? (
					<p class="mt-4 text-sm text-muted-foreground">
						No ETFs match your search.
					</p>
				) : restOfCatalog.length > 0 ? (
					<section class="mt-6">
						<h2 class="text-base font-semibold tracking-tight text-card-foreground">
							{ownedInCatalog.length > 0
								? 'Other Available ETFs'
								: 'Available ETFs'}
						</h2>
						<p class="mt-0.5 text-xs text-muted-foreground">
							{restOfCatalog.length} ETF
							{restOfCatalog.length === 1 ? '' : 's'} listed.
						</p>
						<div class="mt-3 overflow-x-auto rounded-lg border border-border">
							<table class="w-full table-auto border-collapse">
								<thead class="bg-muted/40">
									<tr>
										<td colspan={6} class="h-1" />
									</tr>
									{TABLE_HEADER}
								</thead>
								<tbody>{restOfCatalog.map((e) => renderCatalogRow(e))}</tbody>
							</table>
						</div>
					</section>
				) : null}
			</main>
		)
	}
}
