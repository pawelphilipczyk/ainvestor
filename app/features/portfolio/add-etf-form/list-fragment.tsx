import type { Handle } from 'remix/component'
import { Card } from '../../../components/index.ts'
import { formatValue } from '../../../lib/format.ts'
import type { EtfEntry } from '../../../lib/gist.ts'
import { formatEtfTypeLabel } from '../../../lib/guidelines.ts'
import { format, t } from '../../../lib/i18n.ts'
import { routes } from '../../../routes.ts'
import {
	type CatalogEntry,
	findCatalogEntryForHolding,
} from '../../catalog/lib.ts'
import { EtfCard } from '../etf-card.tsx'

/**
 * Renders the ETF list as HTML fragment for progressive enhancement.
 * Used by GET /fragments/portfolio-list for fetch-based form updates.
 */
export function ListFragment(_handle: Handle, _setup?: unknown) {
	return (props: { entries?: EtfEntry[]; catalog?: CatalogEntry[] }) => {
		const entries = props.entries ?? []
		const catalog = props.catalog ?? []
		return (
			<Card class="p-4">
				<h2 class="text-base font-semibold tracking-tight text-card-foreground">
					{t('portfolio.holdings.title')}
				</h2>
				{entries.length === 0 ? (
					<p class="mt-3 text-sm text-muted-foreground">
						{t('portfolio.holdings.empty')}
					</p>
				) : (
					<ul class="mt-4 grid gap-2">
						{entries.map((entry) => {
							const match = findCatalogEntryForHolding(catalog, entry)
							const classLabel = match ? formatEtfTypeLabel(match.type) : ''
							const idParts = [entry.ticker ?? entry.name]
							if (entry.quantity !== undefined) {
								idParts.push(
									format(t('portfolio.holdings.shares'), {
										count: entry.quantity.toLocaleString(),
									}),
								)
							}
							if (entry.exchange) idParts.push(entry.exchange)
							const identifier = idParts.join(' · ')
							return (
								<EtfCard
									key={entry.id}
									name={entry.name}
									valueLine={formatValue(entry.value, entry.currency)}
									classLabel={classLabel}
									identifier={identifier}
									dialogId={`dialog-${entry.id}`}
									deleteHref={routes.portfolio.delete.href({ id: entry.id })}
								/>
							)
						})}
					</ul>
				)}
			</Card>
		)
	}
}
