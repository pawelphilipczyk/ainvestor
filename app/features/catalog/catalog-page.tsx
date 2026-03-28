import type { Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	getScrollableTableClassNames,
	ScrollableTableFrame,
	SelectInput,
	SubmitButton,
	TextareaInput,
	TextInput,
} from '../../components/index.ts'
import { SectionIntroCard } from '../../components/section-intro-card.tsx'
import { SessionProvider } from '../../components/session-provider.tsx'
import { formatValue } from '../../lib/format.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { ETF_TYPES } from '../../lib/guidelines.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
// @ts-expect-error Runtime-only JS client entry module
import { CatalogPasteInteractions } from './catalog-paste.component.js'
import type { CatalogEntry } from './lib.ts'

type CatalogPageProps = {
	catalog: CatalogEntry[]
	holdings: EtfEntry[]
	typeFilter: string
	query: string
}

/** Keeps long fund names and descriptions readable (wrap) without forcing huge table width. */
const catalogTextColMax = 'max-w-48 sm:max-w-56 md:max-w-xs lg:max-w-sm'

function CatalogTableHeader(_handle: Handle, _setup?: unknown) {
	return () => (
		<tr class="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
			<th class="pb-2 pl-4 pr-4 align-top">Ticker</th>
			<th class={`pb-2 pr-4 align-top ${catalogTextColMax}`}>Name</th>
			<th class="pb-2 pr-4 align-top">Type</th>
			<th class={`pb-2 pr-4 align-top ${catalogTextColMax}`}>Description</th>
			<th class="pb-2 align-top">ISIN</th>
			<th class="pb-2 pl-4 pr-4 align-top">Value</th>
		</tr>
	)
}

function renderCatalogRow(entry: CatalogEntry, holding?: EtfEntry) {
	const valueCell = holding ? (
		<td class="py-2 pl-4 pr-4 align-top text-sm font-medium text-foreground">
			{formatValue(holding.value, holding.currency)}
		</td>
	) : (
		<td class="py-2 pl-4 pr-4 align-top text-sm text-muted-foreground">—</td>
	)

	return (
		<tr
			key={entry.id}
			class="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
		>
			<td class="py-2 pl-4 pr-4 align-top font-mono text-sm font-semibold">
				{entry.ticker}
			</td>
			<td
				class={`py-2 pr-4 align-top text-sm break-words ${catalogTextColMax}`}
			>
				{entry.name}
			</td>
			<td class="py-2 pr-4 align-top">
				<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
					{entry.type.replace('_', ' ')}
				</span>
			</td>
			<td
				class={`py-2 pr-4 align-top text-sm break-words text-muted-foreground ${catalogTextColMax}`}
			>
				{entry.description || '—'}
			</td>
			<td class="py-2 align-top font-mono text-xs text-muted-foreground">
				{entry.isin ?? '—'}
			</td>
			{valueCell}
		</tr>
	)
}

export function CatalogPage(handle: Handle, _setup?: unknown) {
	return (props: CatalogPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		const holdingKey = (s: string) => s.toUpperCase()
		const holdingsByTicker = new Map(
			props.holdings.flatMap((e) => {
				const pairs: [string, EtfEntry][] = [[holdingKey(e.name), e]]
				if (e.ticker) pairs.push([holdingKey(e.ticker), e])
				return pairs
			}),
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
			holdingsByTicker.has(holdingKey(e.ticker)),
		)
		const restOfCatalog = filtered.filter(
			(e) => !holdingsByTicker.has(holdingKey(e.ticker)),
		)

		return (
			<>
				<main class="mx-auto grid min-w-0 max-w-5xl gap-6">
					<SectionIntroCard
						page="catalog"
						variant="page"
						title={SECTION_INTROS.catalog.title}
						description={SECTION_INTROS.catalog.description}
					>
						{sessionUsesGithubGist(session) ? (
							<p class="mt-0.5 text-xs text-muted-foreground">
								Catalog saved to your private GitHub Gist.
							</p>
						) : session?.approvalStatus === 'pending' ? (
							<p class="mt-0.5 text-xs text-muted-foreground">
								Account pending approval — catalog is not saved to GitHub yet.
							</p>
						) : (
							<p class="mt-0.5 text-xs text-muted-foreground">
								Sign in to persist catalog across sessions.
							</p>
						)}
					</SectionIntroCard>

					<Card variant="muted" class="p-4">
						<section>
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
								<FieldLabel fieldId="pasteZone" variant="screenReader">
									Paste bank API JSON
								</FieldLabel>
								<TextareaInput
									id="pasteZone"
									placeholder="Paste fetch response JSON here (Ctrl+V) — imports on paste"
									rows={3}
									class="block max-w-xl"
								/>
							</div>
							{props.catalog.length === 0 ? (
								<div class="mt-4 rounded-lg border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
									<p class="font-medium text-foreground">
										No catalog imported yet.
									</p>
									<p class="mt-1">
										Paste bank API JSON above to add ETFs to your catalog.
									</p>
								</div>
							) : null}
						</section>
					</Card>

					{props.catalog.length > 0 ? (
						<Card variant="muted" class="p-4">
							<form
								method="get"
								action={routes.catalog.index.href()}
								class="flex flex-wrap items-end gap-3"
							>
								<div class="grid gap-1.5">
									<FieldLabel fieldId="type" variant="filter">
										Asset type
									</FieldLabel>
									<SelectInput
										id="type"
										name="type"
										options={[
											{ value: '', label: 'All types' },
											...ETF_TYPES.map((t) => ({
												value: t,
												label: t.replace('_', ' '),
												selected: props.typeFilter === t,
											})),
										]}
									/>
								</div>
								<div class="grid gap-1.5">
									<FieldLabel fieldId="q" variant="filter">
										Search
									</FieldLabel>
									<TextInput
										id="q"
										name="q"
										placeholder="Ticker, name, or description…"
										value={props.query}
										type="search"
										compact
										class="w-64"
									/>
								</div>
								<SubmitButton class="!h-9 !w-auto shrink-0 !py-0 text-sm font-medium">
									Filter
								</SubmitButton>
								{props.typeFilter || props.query ? (
									<a
										href={routes.catalog.index.href()}
										class="hover:text-foreground inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground underline underline-offset-4"
									>
										Clear
									</a>
								) : null}
							</form>
							<p class="mt-3 text-sm text-muted-foreground">
								{props.typeFilter || props.query ? (
									<>
										Showing {filtered.length} of {props.catalog.length} ETFs
									</>
								) : (
									<>
										{props.catalog.length} ETF
										{props.catalog.length === 1 ? '' : 's'} in catalog
									</>
								)}
							</p>
						</Card>
					) : null}

					{ownedInCatalog.length > 0 ? (
						<Card class="min-w-0 p-4">
							<section>
								<h2 class="text-base font-semibold tracking-tight text-card-foreground">
									Your Holdings
								</h2>
								<p class="mt-0.5 text-xs text-muted-foreground">
									ETFs in this catalog that you already own.
								</p>
								<ScrollableTableFrame class="mt-3">
									<table class={getScrollableTableClassNames()}>
										<thead class="bg-muted/40 px-4">
											<tr>
												<td colspan={6} class="h-1" />
											</tr>
											<CatalogTableHeader />
										</thead>
										<tbody>
											{ownedInCatalog.map((e) =>
												renderCatalogRow(
													e,
													holdingsByTicker.get(holdingKey(e.ticker)),
												),
											)}
										</tbody>
									</table>
								</ScrollableTableFrame>
							</section>
						</Card>
					) : null}

					{restOfCatalog.length === 0 && ownedInCatalog.length === 0 ? (
						<Card class="p-4">
							<p class="text-sm text-muted-foreground">
								No ETFs match your search.
							</p>
						</Card>
					) : restOfCatalog.length > 0 ? (
						<Card class="min-w-0 p-4">
							<section>
								<h2 class="text-base font-semibold tracking-tight text-card-foreground">
									{ownedInCatalog.length > 0
										? 'Other Available ETFs'
										: 'Available ETFs'}
								</h2>
								<ScrollableTableFrame class="mt-3">
									<table class={getScrollableTableClassNames()}>
										<thead class="bg-muted/40">
											<tr>
												<td colspan={6} class="h-1" />
											</tr>
											<CatalogTableHeader />
										</thead>
										<tbody>
											{restOfCatalog.map((e) => renderCatalogRow(e))}
										</tbody>
									</table>
								</ScrollableTableFrame>
							</section>
						</Card>
					) : null}
				</main>
				<CatalogPasteInteractions />
			</>
		)
	}
}
