import type { Handle } from 'remix/ui'
import { Card, Link, ScrollableTable } from '../../components/index.ts'
import { formatValue } from '../../lib/format.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'
import { routes } from '../../routes.ts'
import { DEFAULT_ADVICE_MODEL } from '../advice/advice-openai.ts'
import {
	type CatalogEntry,
	type CatalogRiskBand,
	riskBandFromRiskKid,
} from './lib.ts'

const catalogTextColMax = 'max-w-48 sm:max-w-56 md:max-w-xs lg:max-w-sm'

/** Slightly roomier than default `px-2 py-0.5` so type and risk pills match visually. */
const catalogTableChipShellClass = 'rounded-full px-2.5 py-1 text-xs'

function catalogRiskBandLabel(band: CatalogRiskBand): string {
	if (band === 'low') return t('catalog.riskBand.low')
	if (band === 'medium') return t('catalog.riskBand.medium')
	return t('catalog.riskBand.high')
}

function catalogRiskBandChipClassName(band: CatalogRiskBand): string {
	const shell = catalogTableChipShellClass
	if (band === 'low') {
		return `${shell} bg-sky-200/80 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200`
	}
	if (band === 'medium') {
		return `${shell} bg-yellow-400/25 text-yellow-700 dark:bg-yellow-400/15 dark:text-yellow-200`
	}
	return `${shell} bg-red-500/25 text-red-700 dark:bg-red-500/15 dark:text-red-300`
}

function CatalogTableHeader(_handle: Handle<Record<string, never>>) {
	return () => (
		<tr class="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
			<th class="pb-2 pl-4 pr-4 align-top">{t('catalog.table.ticker')}</th>
			<th class={`pb-2 pr-4 align-top ${catalogTextColMax}`}>
				{t('catalog.table.name')}
			</th>
			<th class="pb-2 pr-4 align-top">{t('catalog.table.type')}</th>
			<th class="pb-2 pr-4 align-top">{t('catalog.table.risk')}</th>
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
	const riskBand = riskBandFromRiskKid(entry.risk_kid)
	const riskCell =
		riskBand === undefined ? (
			<span class="text-sm text-muted-foreground">
				{t('catalog.emptyCell')}
			</span>
		) : (
			<span
				class={catalogRiskBandChipClassName(riskBand)}
				data-risk-band={riskBand}
			>
				{catalogRiskBandLabel(riskBand)}
			</span>
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
				<span
					class={`${catalogTableChipShellClass} bg-muted text-muted-foreground`}
				>
					{formatEtfTypeLabel(entry.type) || t('catalog.etfTypeUnknown')}
				</span>
			</td>
			<td class="py-2 pr-4 align-top">{riskCell}</td>
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

const catalogTableColSpan = 7

function renderCatalogEtfScrollableTable(params: {
	entries: CatalogEntry[]
	holdingsByTicker: Map<string, EtfEntry>
	tickerLinksToDetail: boolean
}) {
	const { entries, holdingsByTicker, tickerLinksToDetail } = params
	const normalizedTickerKey = (ticker: string) => ticker.toUpperCase()
	return (
		<ScrollableTable wrapperClass="mt-3">
			<thead class="bg-muted/40 px-4">
				<tr>
					<td colspan={catalogTableColSpan} class="h-1" />
				</tr>
				<CatalogTableHeader />
			</thead>
			<tbody>
				{entries.map((entry) =>
					renderCatalogRow(
						entry,
						holdingsByTicker.get(normalizedTickerKey(entry.ticker)),
						{ tickerLinksToDetail },
					),
				)}
			</tbody>
		</ScrollableTable>
	)
}

type CatalogListFragmentProps = {
	catalog: CatalogEntry[]
	holdings: EtfEntry[]
	typeFilter: string
	riskFilter: '' | CatalogRiskBand
	query: string
	totalCatalogCount: number
	isAdmin: boolean
	pendingApproval?: boolean
}

/**
 * Renders the filtered catalog tables (holdings section + available section).
 * Used as Frame content and during SSR resolveFrame.
 */
export function CatalogListFragment(handle: Handle<CatalogListFragmentProps>) {
	return () => {
		const props = handle.props
		const tickerLinksToDetail = !props.pendingApproval
		const normalizedHoldingsLookupKey = (holdingNameOrTicker: string) =>
			holdingNameOrTicker.toUpperCase()
		const holdingsByTicker = new Map(
			props.holdings.flatMap((e) => {
				const pairs: [string, EtfEntry][] = [
					[normalizedHoldingsLookupKey(e.name), e],
				]
				if (e.ticker) pairs.push([normalizedHoldingsLookupKey(e.ticker), e])
				return pairs
			}),
		)

		const filtered = props.catalog.filter((entry) => {
			const matchesType = !props.typeFilter || entry.type === props.typeFilter
			const band = riskBandFromRiskKid(entry.risk_kid)
			const matchesRisk =
				!props.riskFilter || (band !== undefined && band === props.riskFilter)
			const queryLower = props.query.toLowerCase()
			const matchesQuery =
				!props.query ||
				entry.ticker.toLowerCase().includes(queryLower) ||
				entry.name.toLowerCase().includes(queryLower) ||
				entry.description.toLowerCase().includes(queryLower)
			return matchesType && matchesRisk && matchesQuery
		})

		const ownedInCatalog = filtered.filter((catalogEntry) =>
			holdingsByTicker.has(normalizedHoldingsLookupKey(catalogEntry.ticker)),
		)
		const restOfCatalog = filtered.filter(
			(catalogEntry) =>
				!holdingsByTicker.has(normalizedHoldingsLookupKey(catalogEntry.ticker)),
		)

		return (
			<>
				<p class="text-sm text-muted-foreground">
					{props.typeFilter || props.riskFilter || props.query
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
							{renderCatalogEtfScrollableTable({
								entries: ownedInCatalog,
								holdingsByTicker,
								tickerLinksToDetail,
							})}
						</section>
					</Card>
				) : null}

				{restOfCatalog.length === 0 && ownedInCatalog.length === 0 ? (
					props.totalCatalogCount === 0 ? (
						<div class="rounded-lg border border-dashed border-border bg-card/60 p-4">
							<p class="font-medium text-foreground">
								{t('catalog.empty.title')}
							</p>
							<p class="mt-1 text-sm text-muted-foreground">
								{t('catalog.empty.hint')}
							</p>
							{props.isAdmin ? (
								<p class="mt-3">
									<Link
										href={routes.admin.etfImport.href()}
										rmx-document
										class="text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/90"
									>
										{t('catalog.empty.adminImportLink')}
									</Link>
								</p>
							) : null}
						</div>
					) : (
						<Card class="p-4">
							<p class="text-sm text-muted-foreground">
								{t('catalog.noMatch')}
							</p>
						</Card>
					)
				) : restOfCatalog.length > 0 ? (
					<Card class="min-w-0 p-4">
						<section>
							<h2 class="text-base font-semibold tracking-tight text-card-foreground">
								{ownedInCatalog.length > 0
									? t('catalog.section.otherAvailable')
									: t('catalog.section.available')}
							</h2>
							{renderCatalogEtfScrollableTable({
								entries: restOfCatalog,
								holdingsByTicker,
								tickerLinksToDetail,
							})}
						</section>
					</Card>
				) : null}
			</>
		)
	}
}
