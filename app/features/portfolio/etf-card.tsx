import type { Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	NumberInput,
	PercentageBar,
} from '../../components/index.ts'
import { clampGuidelineBarWidthPercent } from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'
import { LOCALE_DECIMAL_HTML_PATTERN } from '../../lib/locale-decimal-input.ts'

/** Same height as {@link NumberInput} default (`h-10`) for inline row alignment. */
const portfolioRowGhostButtonClass =
	'inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-3 py-0 text-sm font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
const portfolioRowSellButtonClass =
	'inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-3 py-0 text-sm font-normal text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'

type EtfCardProps = {
	entryId: string
	name: string
	currency: string
	/** Formatted market value for read-only summary (e.g. `PLN 1,234.56`). */
	valueDisplay: string
	/** Optional shares line under the value when quantity is set. */
	quantitySummaryLine?: string
	valueForInput: string
	quantityForInput: string
	identifier: string
	/** 0–100 share of total holdings value; parent computes from list + total. Omit when unknown (e.g. mixed currencies). */
	valueSharePercent?: number
	dialogId: string
	deleteHref: string
	updateHref: string
}

/**
 * Server-rendered ETF card for portfolio list.
 * Read-only by default; edit form lives in `<details>` so list refreshes show correct values without stale inputs.
 * Interactivity is provided by EtfCardInteractions (clientEntry) in etf-card.component.js.
 */
export function EtfCard(_handle: Handle, _setup?: unknown) {
	return (props: EtfCardProps) => {
		const valueFieldId = `portfolio-value-${props.entryId}`
		const quantityFieldId = `portfolio-quantity-${props.entryId}`
		const editDetailsId = `portfolio-edit-${props.entryId}`
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
			<Card as="li" class="flex min-w-0 flex-col gap-2 px-4 py-3">
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
				<div class="flex min-w-0 flex-col gap-1">
					<p class="text-sm tabular-nums text-card-foreground">
						{props.valueDisplay}
					</p>
					{props.quantitySummaryLine !== undefined ? (
						<p class="text-xs text-muted-foreground">
							{props.quantitySummaryLine}
						</p>
					) : null}
				</div>
				<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
					<details id={editDetailsId} class="min-w-0">
						<summary
							class="cursor-pointer list-none rounded-md px-0 py-1 text-sm font-medium text-primary underline underline-offset-2 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
							aria-label={format(t('portfolio.etf.editDetailsSummary'), {
								name: props.name,
							})}
						>
							{t('portfolio.etf.edit')}
						</summary>
						<form
							method="post"
							action={props.updateHref}
							class="mt-3 flex min-w-0 flex-wrap items-end gap-x-2 gap-y-2 border-t border-border pt-3"
							data-frame-submit="portfolio-list"
							data-frame-replace-from-response="1"
						>
							<div class="grid w-auto shrink-0 gap-0.5">
								<FieldLabel fieldId={valueFieldId} variant="dense">
									{format(t('portfolio.etf.updateValueLabel'), {
										currency: props.currency,
									})}
								</FieldLabel>
								<NumberInput
									id={valueFieldId}
									name="value"
									class="!w-28 shrink-0"
									value={props.valueForInput}
									required={true}
									inputMode="decimal"
									pattern={LOCALE_DECIMAL_HTML_PATTERN}
									aria-label={format(
										t('portfolio.etf.updateValueScreenReader'),
										{
											name: props.name,
										},
									)}
								/>
							</div>
							<div class="grid w-auto shrink-0 gap-0.5">
								<FieldLabel fieldId={quantityFieldId} variant="dense">
									{t('portfolio.etf.updateQuantityLabel')}
								</FieldLabel>
								<NumberInput
									id={quantityFieldId}
									name="quantity"
									class="!w-20 shrink-0"
									value={props.quantityForInput}
									inputMode="numeric"
									pattern="[0-9]*"
									aria-label={format(
										t('portfolio.etf.updateQuantityScreenReader'),
										{
											name: props.name,
										},
									)}
								/>
							</div>
							<button type="submit" class={portfolioRowGhostButtonClass}>
								{t('portfolio.etf.save')}
							</button>
						</form>
					</details>
					<form
						method="post"
						action={props.deleteHref}
						class="inline"
						data-dialog-id={props.dialogId}
						data-enhance-dialog=""
					>
						<input type="hidden" name="_method" value="DELETE" />
						<button
							type="submit"
							class={portfolioRowSellButtonClass}
							aria-label={format(t('portfolio.etf.removeAria'), {
								name: props.name,
							})}
						>
							{t('portfolio.etf.sell')}
						</button>
					</form>
				</div>
				<dialog
					id={props.dialogId}
					class="rounded-lg border border-border bg-card p-4 shadow-lg backdrop:bg-black/50"
				>
					<p class="mb-4 text-sm font-medium text-card-foreground">
						{format(t('portfolio.etf.removeConfirm'), { name: props.name })}
					</p>
					<div class="flex justify-end gap-2">
						<form method="dialog">
							<button
								type="submit"
								class="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-accent"
							>
								{t('portfolio.etf.cancel')}
							</button>
						</form>
						<form
							method="post"
							action={props.deleteHref}
							data-frame-submit="portfolio-list"
						>
							<input type="hidden" name="_method" value="DELETE" />
							<button
								type="submit"
								class="rounded-md bg-destructive px-3 py-1.5 text-sm text-white hover:opacity-90"
							>
								{t('portfolio.etf.remove')}
							</button>
						</form>
					</div>
				</dialog>
			</Card>
		)
	}
}
