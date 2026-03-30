import type { Handle } from 'remix/component'
import { Card, FieldLabel, NumberInput } from '../../components/index.ts'
import { format, t } from '../../lib/i18n.ts'
import { LOCALE_DECIMAL_HTML_PATTERN } from '../../lib/locale-decimal-input.ts'
import { routes } from '../../routes.ts'

/** Matches {@link NumberInput} control padding (`px-3 py-2`) for one baseline with fields. */
const portfolioRowGhostButtonClass =
	'inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-3 py-2 text-sm font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
const portfolioRowSellButtonClass =
	'inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-3 py-2 text-sm font-normal text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'

type EtfCardProps = {
	entryId: string
	name: string
	currency: string
	valueForInput: string
	quantityForInput: string
	identifier: string
	dialogId: string
	deleteHref: string
	updateHref: string
}

/**
 * Server-rendered ETF card for portfolio list.
 * Interactivity is provided by EtfCardInteractions (clientEntry) in etf-card.component.js.
 */
export function EtfCard(_handle: Handle, _setup?: unknown) {
	return (props: EtfCardProps) => {
		const updateErrorId = `portfolio-entry-${props.entryId}-error`
		const valueFieldId = `portfolio-value-${props.entryId}`
		const quantityFieldId = `portfolio-quantity-${props.entryId}`
		return (
			<Card as="li" class="flex min-w-0 flex-col gap-2 px-4 py-3">
				<div
					id={updateErrorId}
					role="alert"
					class="hidden rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
				/>
				<h3 class="truncate text-sm font-semibold text-card-foreground">
					{props.name}
				</h3>
				<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
					<span class="min-w-0 truncate font-mono text-xs text-muted-foreground">
						{props.identifier}
					</span>
				</div>
				<div class="flex min-w-0 flex-wrap items-end gap-x-2 gap-y-2">
					<form
						method="post"
						action={props.updateHref}
						class="flex min-w-0 flex-wrap items-end gap-x-2 gap-y-2"
						data-fetch-submit
						data-fragment-id="portfolio-list"
						data-fragment-url={routes.portfolio.fragmentList.href()}
						data-error-id={updateErrorId}
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
								aria-label={format(t('portfolio.etf.updateValueSr'), {
									name: props.name,
								})}
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
								aria-label={format(t('portfolio.etf.updateQuantitySr'), {
									name: props.name,
								})}
							/>
						</div>
						<button type="submit" class={portfolioRowGhostButtonClass}>
							{t('portfolio.etf.save')}
						</button>
					</form>
					<button
						type="button"
						class={portfolioRowSellButtonClass}
						aria-label={format(t('portfolio.etf.removeAria'), {
							name: props.name,
						})}
						data-dialog-id={props.dialogId}
					>
						{t('portfolio.etf.sell')}
					</button>
				</div>
				<dialog
					id={props.dialogId}
					class="rounded-lg border border-border bg-card p-4 shadow-lg backdrop:bg-black/50"
				>
					<p class="mb-4 text-sm text-card-foreground">
						{t('portfolio.etf.removeConfirmBefore')}
						<strong>{props.name}</strong>
						{t('portfolio.etf.removeConfirmAfter')}
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
							data-fetch-submit
							data-fragment-id="portfolio-list"
							data-fragment-url={routes.portfolio.fragmentList.href()}
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
