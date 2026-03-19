import type { Handle } from 'remix/component'
import { formatValue } from '../../../lib/format.ts'
import type { EtfEntry } from '../../../lib/gist.ts'
import { routes } from '../../../routes.ts'
import { EtfCard } from '../etf-card.tsx'

/**
 * Renders the ETF list as HTML fragment for progressive enhancement.
 * Used by GET /fragments/portfolio-list for fetch-based form updates.
 */
export function ListFragment(_handle: Handle, _setup?: unknown) {
	return (props: { entries?: EtfEntry[] }) => {
		const entries = props.entries ?? []
		if (entries.length === 0) {
			return (
				<p class="mt-4 text-sm text-muted-foreground">No ETFs added yet.</p>
			)
		}
		return (
			<ul class="mt-4 grid gap-2">
				{entries.map((entry) => {
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
		)
	}
}
