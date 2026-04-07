import type { Handle } from 'remix/component'
import { Card, PercentageBar } from '../../components/index.ts'
import { clampGuidelineBarWidthPercent } from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'

const sellShortcutButtonClass =
	'inline-flex shrink-0 items-center rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

type EtfCardProps = {
	/** Stable row id (for tests and diagnostics). */
	entryId: string
	name: string
	/** Formatted market value for read-only summary (e.g. `PLN 1,234.56`). */
	valueDisplay: string
	identifier: string
	/** Catalog `instrumentTicker` form value for the sell shortcut (when in catalog). */
	instrumentTickerForForm: string
	/** When false, catalog is empty — hide sell shortcut. */
	showSellShortcut: boolean
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
				<div class="flex min-w-0 items-start justify-between gap-2">
					<h3 class="min-w-0 truncate text-sm font-semibold text-card-foreground">
						{props.name}
					</h3>
					{props.showSellShortcut ? (
						<button
							type="button"
							class={sellShortcutButtonClass}
							data-portfolio-sell-shortcut=""
							data-instrument-ticker={props.instrumentTickerForForm}
						>
							{t('portfolio.etf.sellShortcut')}
						</button>
					) : null}
				</div>
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
