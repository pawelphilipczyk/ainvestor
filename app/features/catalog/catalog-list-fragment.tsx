import type { Handle } from 'remix/component'
import { Card, Link, ScrollableTable } from '../../components/index.ts'
import { formatValue } from '../../lib/format.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'
import { routes } from '../../routes.ts'
import { DEFAULT_ADVICE_MODEL } from '../advice/advice-openai.ts'
import type { CatalogEntry } from './lib.ts'

const catalogTextColMax = 'max-w-48 sm:max-w-56 md:max-w-xs lg:max-w-sm'

function CatalogTableHeader(_handle: Handle, _setup?: unknown) {
	return () => (
		<tr class="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
			<th class="pb-2 pl-4 pr-4 align-top">{t('catalog.table.ticker')}</th>
			<th class={`pb-2 pr-4 align-top ${catalogTextColMax}`}>
				{t('catalog.table.name')}
			</th>
			<th class="pb-2 pr-4 align-top">{t('catalog.table.type')}</th>
			<th class={`pb-2 pr-4 align-top ${catalogTextColMax}`}>
				{t('catalog.table.description')}
			</th>
			<th class="pb-2 align-top">{t('catalog.table.isin')}</th>
			<th class="pb-2 pl-4 pr-4 align-top">{t('catalog.table.value')}</th>
		</tr>
	)
}

function renderCatalogRow(
	entry: CatalogEntry,
	holding: EtfEntry | undefined,
	options: { tickerLinksToDetail: boolean },
) {
	const { tickerLinksToDetail } = options
	const etfDetailHref = routes.catalog.etf.href(
		{ catalogEntryId: entry.id },
		{ model: DEFAULT_ADVICE_MODEL },
	)
	const valueCell = holding ? (
		<td class="py-2 pl-4 pr-4 align-top text-sm font-medium text-foreground">
			{formatValue(holding.value, holding.currency)}
		</td>
	) : (
		<td class="py-2 pl-4 pr-4 align-top text-sm text-muted-foreground">
			{t('catalog.emptyCell')}
		</td>
	)

	return (
		<tr
			key={entry.id}
			class="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
		>
			<td class="py-2 pl-4 pr-4 align-top font-mono text-sm font-semibold">
				{tickerLinksToDetail ? (
					<Link
						href={etfDetailHref}
						navigationLoading={true}
						class="text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{entry.ticker}
					</Link>
				) : (
					entry.ticker
				)}
			</td>
			<td
				class={`py-2 pr-4 align-top text-sm break-words ${catalogTextColMax}`}
			>
				{entry.name}
			</td>
			<td class="py-2 pr-4 align-top">
				<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
					{formatEtfTypeLabel(entry.type) || t('catalog.etfTypeUnknown')}
				</span>
			</td>
			<td
				class={`py-2 pr-4 align-top text-sm break-words text-muted-foreground ${catalogTextColMax}`}
			>
				{entry.description || t('catalog.emptyCell')}
			</td>
			<td class="py-2 align-top font-mono text-xs text-muted-foreground">
				{entry.isin ?? t('catalog.emptyCell')}
			</td>
			{valueCell}
		</tr>
	)
}

type CatalogListFragmentProps = {
	catalog: CatalogEntry[]
	holdings: EtfEntry[]
	typeFilter: string
	query: string
	totalCatalogCount: number
	pendingApproval?: boolean
}

/**
 * Renders the filtered catalog tables (holdings section + available section).
 * Used as Frame content and during SSR resolveFrame.
 */
export function CatalogListFragment(_handle: Handle, _setup?: unknown) {
	return (props: CatalogListFragmentProps) => {
		const tickerLinksToDetail = !props.pendingApproval
		const tableColSpan = 6
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
			const queryLower = props.query.toLowerCase()
			const matchesQuery =
				!props.query ||
				entry.ticker.toLowerCase().includes(queryLower) ||
				entry.name.toLowerCase().includes(queryLower) ||
				entry.description.toLowerCase().includes(queryLower)
			return matchesType && matchesQuery
		})

		const ownedInCatalog = filtered.filter((catalogEntry) =>
			holdingsByTicker.has(holdingKey(catalogEntry.ticker)),
		)
		const restOfCatalog = filtered.filter(
			(catalogEntry) => !holdingsByTicker.has(holdingKey(catalogEntry.ticker)),
		)

		return (
			<>
				<p class="text-sm text-muted-foreground">
					{props.typeFilter || props.query
						? format(t('catalog.count.showing'), {
								filtered: filtered.length,
								total: props.totalCatalogCount,
							})
						: props.totalCatalogCount === 1
							? format(t('catalog.count.one'), {
									n: props.totalCatalogCount,
								})
							: format(t('catalog.count.many'), {
									n: props.totalCatalogCount,
								})}
				</p>

				{ownedInCatalog.length > 0 ? (
					<Card class="min-w-0 p-4">
						<section>
							<h2 class="text-base font-semibold tracking-tight text-card-foreground">
								{t('catalog.holdings.title')}
							</h2>
							<p class="mt-0.5 text-xs text-muted-foreground">
								{t('catalog.holdings.subtitle')}
							</p>
							<ScrollableTable wrapperClass="mt-3">
								<thead class="bg-muted/40 px-4">
									<tr>
										<td colspan={tableColSpan} class="h-1" />
									</tr>
									<CatalogTableHeader />
								</thead>
								<tbody>
									{ownedInCatalog.map((e) =>
										renderCatalogRow(
											e,
											holdingsByTicker.get(holdingKey(e.ticker)),
											{ tickerLinksToDetail },
										),
									)}
								</tbody>
							</ScrollableTable>
						</section>
					</Card>
				) : null}

				{restOfCatalog.length === 0 && ownedInCatalog.length === 0 ? (
					<Card class="p-4">
						<p class="text-sm text-muted-foreground">{t('catalog.noMatch')}</p>
					</Card>
				) : restOfCatalog.length > 0 ? (
					<Card class="min-w-0 p-4">
						<section>
							<h2 class="text-base font-semibold tracking-tight text-card-foreground">
								{ownedInCatalog.length > 0
									? t('catalog.section.otherAvailable')
									: t('catalog.section.available')}
							</h2>
							<ScrollableTable wrapperClass="mt-3">
								<thead class="bg-muted/40">
									<tr>
										<td colspan={tableColSpan} class="h-1" />
									</tr>
									<CatalogTableHeader />
								</thead>
								<tbody>
									{restOfCatalog.map((e) =>
										renderCatalogRow(e, undefined, { tickerLinksToDetail }),
									)}
								</tbody>
							</ScrollableTable>
						</section>
					</Card>
				) : null}
			</>
		)
	}
}
