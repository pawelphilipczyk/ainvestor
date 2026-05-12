import type { Handle } from 'remix/ui'
import { Card, PercentageBar } from '../../components/index.ts'
import { clampGuidelineBarWidthPercent } from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'

const rowTradeButtonBaseClass =
	'inline-flex shrink-0 items-center rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const rowTradeBuyClass = `${rowTradeButtonBaseClass} text-muted-foreground hover:bg-accent hover:text-accent-foreground`
const rowTradeSellClass = `${rowTradeButtonBaseClass} text-muted-foreground hover:bg-destructive/10 hover:text-destructive`

type EtfCardProps = {
	/** Stable row id (for tests and diagnostics). */
	entryId: string
	name: string
	/** Formatted market value for read-only summary (e.g. `PLN 1,234.56`). */
	valueDisplay: string
	identifier: string
	/** Catalog `instrumentTicker` form value when the fund exists in the catalog. */
	instrumentTickerForForm: string
	/** When false, catalog is empty — hide row trade actions. */
	showRowTradeActions: boolean
	/** 0–100 share of total holdings value; parent computes from list + total. Omit when unknown (e.g. mixed currencies). */
	valueSharePercent?: number
}

/**
 * Server-rendered read-only ETF row for the portfolio list.
 * Buy and sell use the shared form above the list.
 */
export function EtfCard(_handle: Handle) {
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
				<h3 class="min-w-0 break-words text-sm font-semibold text-card-foreground">
					{props.name}
				</h3>
				<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
					<span class="min-w-0 truncate font-mono text-xs text-muted-foreground">
						{props.identifier}
					</span>
				</div>
				<div class="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
					<p class="min-w-0 text-sm tabular-nums text-card-foreground">
						{props.valueDisplay}
					</p>
					{props.showRowTradeActions ? (
						<div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
							<button
								type="button"
								class={rowTradeBuyClass}
								data-portfolio-trade-focus=""
								data-portfolio-operation="buy"
								data-instrument-ticker={props.instrumentTickerForForm}
							>
								{t('portfolio.etf.buyMore')}
							</button>
							<button
								type="button"
								class={rowTradeSellClass}
								data-portfolio-trade-focus=""
								data-portfolio-operation="sell"
								data-instrument-ticker={props.instrumentTickerForForm}
							>
								{t('portfolio.etf.sell')}
							</button>
						</div>
					) : null}
				</div>
			</Card>
		)
	}
}
