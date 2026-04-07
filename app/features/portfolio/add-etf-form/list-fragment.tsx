import type { Handle } from 'remix/component'
import { Card } from '../../../components/index.ts'
import { formatValue } from '../../../lib/format.ts'
import type { EtfEntry } from '../../../lib/gist.ts'
import { t } from '../../../lib/i18n.ts'
import {
	totalHoldingsValueForShareBars,
	valueShareOfHoldingsTotalPercent,
} from '../../../lib/portfolio-holdings-share.ts'
import { EtfCard } from '../etf-card.tsx'

/**
 * Renders the ETF list as HTML fragment for progressive enhancement.
 * Used by GET /fragments/portfolio-list for fetch-based form updates.
 */
export function ListFragment(_handle: Handle, _setup?: unknown) {
	return (props: { entries?: EtfEntry[]; inlineError?: string }) => {
		const entries = props.entries ?? []
		const holdingsTotal = totalHoldingsValueForShareBars(entries)
		const canShowShareBars = holdingsTotal !== null && holdingsTotal > 0
		const inlineError = props.inlineError?.trim() ?? ''
		return (
			<Card class="p-4">
				{inlineError.length > 0 ? (
					<div
						role="alert"
						class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					>
						{inlineError}
					</div>
				) : null}
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
							const idParts = [entry.ticker ?? entry.name]
							if (entry.exchange) idParts.push(entry.exchange)
							const identifier = idParts.join(' · ')
							return (
								<EtfCard
									key={entry.id}
									entryId={entry.id}
									name={entry.name}
									valueDisplay={formatValue(entry.value, entry.currency)}
									identifier={identifier}
									valueSharePercent={
										canShowShareBars
											? valueShareOfHoldingsTotalPercent({
													value: entry.value,
													total: holdingsTotal,
												})
											: undefined
									}
								/>
							)
						})}
					</ul>
				)}
			</Card>
		)
	}
}
