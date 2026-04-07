import type { Handle } from 'remix/component'
import { Card, PercentageBar } from '../../components/index.ts'
import { clampGuidelineBarWidthPercent } from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'

type EtfCardProps = {
	/** Stable row id (for tests and diagnostics). */
	entryId: string
	name: string
	/** Formatted market value for read-only summary (e.g. `PLN 1,234.56`). */
	valueDisplay: string
	identifier: string
	/** 0–100 share of total holdings value; parent computes from list + total. Omit when unknown (e.g. mixed currencies). */
	valueSharePercent?: number
}

/**
 * Server-rendered read-only ETF row for the portfolio list.
 * Buy and sell use the shared form above the list.
 */
export function EtfCard(_handle: Handle, _setup?: unknown) {
	return (props: EtfCardProps) => {
		const valueSharePercent =
			props.valueSharePercent === undefined
				? undefined
				: clampGuidelineBarWidthPercent(props.valueSharePercent)
		const shareBarLabel =
			valueSharePercent === undefined
				? undefined
				: format(t('portfolio.etf.valueShareBarAria'), {
						percent: valueSharePercent,
						name: props.name,
					})
		return (
			<Card
				as="li"
				class="flex min-w-0 flex-col gap-2 px-4 py-3"
				data-holding-id={props.entryId}
			>
				{valueSharePercent !== undefined && shareBarLabel !== undefined ? (
					<PercentageBar
						ariaLabel={shareBarLabel}
						widthPercent={valueSharePercent}
					/>
				) : null}
				<h3 class="truncate text-sm font-semibold text-card-foreground">
					{props.name}
				</h3>
				<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
					<span class="min-w-0 truncate font-mono text-xs text-muted-foreground">
						{props.identifier}
					</span>
				</div>
				<p class="text-sm tabular-nums text-card-foreground">
					{props.valueDisplay}
				</p>
			</Card>
		)
	}
}
