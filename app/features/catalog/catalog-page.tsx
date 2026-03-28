import type { Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	SelectInput,
	SubmitButton,
	TextareaInput,
	TextInput,
} from '../../components/index.ts'
import { SessionProvider } from '../../components/session-provider.tsx'
import { formatValue } from '../../lib/format.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { ETF_TYPES, formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'
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

function CatalogTableHeader(_handle: Handle, _setup?: unknown) {
	return () => (
		<tr class="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
			<th class="pb-2 pl-4 pr-4">{t('catalog.table.ticker')}</th>
			<th class="pb-2 pr-4">{t('catalog.table.name')}</th>
			<th class="pb-2 pr-4">{t('catalog.table.type')}</th>
			<th class="pb-2 pr-4">{t('catalog.table.description')}</th>
			<th class="pb-2">{t('catalog.table.isin')}</th>
			<th class="pb-2 pl-4 pr-4">{t('catalog.table.value')}</th>
		</tr>
	)
}

function renderCatalogRow(entry: CatalogEntry, holding?: EtfEntry) {
	const valueCell = holding ? (
		<td class="py-2 pl-4 pr-4 text-sm font-medium text-foreground">
			{formatValue(holding.value, holding.currency)}
		</td>
	) : (
		<td class="py-2 pl-4 pr-4 text-sm text-muted-foreground">
			{t('catalog.emptyCell')}
		</td>
	)

	return (
		<tr
			key={entry.id}
			class="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
		>
			<td class="py-2 pl-4 pr-4 font-mono text-sm font-semibold">
				{entry.ticker}
			</td>
			<td class="py-2 pr-4 text-sm">{entry.name}</td>
			<td class="py-2 pr-4">
				<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
					{formatEtfTypeLabel(entry.type)}
				</span>
			</td>
			<td class="max-w-xs truncate py-2 pr-4 text-sm text-muted-foreground">
				{entry.description || t('catalog.emptyCell')}
			</td>
			<td class="py-2 font-mono text-xs text-muted-foreground">
				{entry.isin ?? t('catalog.emptyCell')}
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
				<main class="mx-auto grid max-w-5xl gap-6">
					<Card class="p-6">
						<header>
							<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
								{t('catalog.title')}
							</h1>
							<p class="mt-1 text-sm text-muted-foreground">
								{t('catalog.subtitle')}
							</p>
							{sessionUsesGithubGist(session) ? (
								<p class="mt-0.5 text-xs text-muted-foreground">
									{t('catalog.savedGist')}
								</p>
							) : session?.approvalStatus === 'pending' ? (
								<p class="mt-0.5 text-xs text-muted-foreground">
									{t('catalog.pendingNotSaved')}
								</p>
							) : (
								<p class="mt-0.5 text-xs text-muted-foreground">
									{t('catalog.signInPersist')}
								</p>
							)}
						</header>
					</Card>

					<Card variant="muted" class="p-4">
						<section>
							<h2 class="text-base font-semibold tracking-tight text-card-foreground">
								{t('catalog.import.title')}
							</h2>
							<p class="mt-0.5 text-xs text-muted-foreground">
								{t('catalog.import.subtitle')}
							</p>
							<div
								data-catalog-paste-zone
								data-import-url={routes.catalog.import.href()}
								class="mt-3"
							>
								<FieldLabel fieldId="pasteZone" variant="screenReader">
									{t('catalog.import.pasteLabel.sr')}
								</FieldLabel>
								<TextareaInput
									id="pasteZone"
									placeholder={t('catalog.import.pastePlaceholder')}
									rows={3}
									class="block max-w-xl"
								/>
							</div>
							{props.catalog.length === 0 ? (
								<div class="mt-4 rounded-lg border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
									<p class="font-medium text-foreground">
										{t('catalog.empty.title')}
									</p>
									<p class="mt-1">{t('catalog.empty.hint')}</p>
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
										{t('catalog.filter.assetType')}
									</FieldLabel>
									<SelectInput
										id="type"
										name="type"
										options={[
											{ value: '', label: t('catalog.filter.allTypes') },
											...ETF_TYPES.map((etfType) => ({
												value: etfType,
												label: formatEtfTypeLabel(etfType),
												selected: props.typeFilter === etfType,
											})),
										]}
									/>
								</div>
								<div class="grid gap-1.5">
									<FieldLabel fieldId="q" variant="filter">
										{t('catalog.filter.search')}
									</FieldLabel>
									<TextInput
										id="q"
										name="q"
										placeholder={t('catalog.filter.searchPlaceholder')}
										value={props.query}
										type="search"
										compact
										class="w-64"
									/>
								</div>
								<SubmitButton class="!h-9 !w-auto shrink-0 !py-0 text-sm font-medium">
									{t('catalog.filter.submit')}
								</SubmitButton>
								{props.typeFilter || props.query ? (
									<a
										href={routes.catalog.index.href()}
										class="hover:text-foreground inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground underline underline-offset-4"
									>
										{t('catalog.filter.clear')}
									</a>
								) : null}
							</form>
							<p class="mt-3 text-sm text-muted-foreground">
								{props.typeFilter || props.query
									? format(t('catalog.count.showing'), {
											filtered: filtered.length,
											total: props.catalog.length,
										})
									: props.catalog.length === 1
										? format(t('catalog.count.one'), {
												n: props.catalog.length,
											})
										: format(t('catalog.count.many'), {
												n: props.catalog.length,
											})}
							</p>
						</Card>
					) : null}

					{ownedInCatalog.length > 0 ? (
						<Card class="p-4">
							<section>
								<h2 class="text-base font-semibold tracking-tight text-card-foreground">
									{t('catalog.holdings.title')}
								</h2>
								<p class="mt-0.5 text-xs text-muted-foreground">
									{t('catalog.holdings.subtitle')}
								</p>
								<div class="mt-3 overflow-x-auto rounded-lg border border-border">
									<table class="w-full table-auto border-collapse">
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
								</div>
							</section>
						</Card>
					) : null}

					{restOfCatalog.length === 0 && ownedInCatalog.length === 0 ? (
						<Card class="p-4">
							<p class="text-sm text-muted-foreground">
								{t('catalog.noMatch')}
							</p>
						</Card>
					) : restOfCatalog.length > 0 ? (
						<Card class="p-4">
							<section>
								<h2 class="text-base font-semibold tracking-tight text-card-foreground">
									{ownedInCatalog.length > 0
										? t('catalog.section.otherAvailable')
										: t('catalog.section.available')}
								</h2>
								<div class="mt-3 overflow-x-auto rounded-lg border border-border">
									<table class="w-full table-auto border-collapse">
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
								</div>
							</section>
						</Card>
					) : null}
				</main>
				<CatalogPasteInteractions />
			</>
		)
	}
}
