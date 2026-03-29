import type { Handle } from 'remix/component'
import { Card } from '../../components/index.ts'
import { format, t } from '../../lib/i18n.ts'
import { routes } from '../../routes.ts'

type EtfCardProps = {
	name: string
	valueLine: string
	identifier: string
	dialogId: string
	deleteHref: string
}

/**
 * Server-rendered ETF card for portfolio list.
 * Interactivity is provided by EtfCardInteractions (clientEntry) in etf-card.component.js.
 */
export function EtfCard(_handle: Handle, _setup?: unknown) {
	return (props: EtfCardProps) => (
		<Card as="li" class="flex min-w-0 flex-col gap-3 px-4 py-3">
			<h3 class="truncate text-sm font-semibold text-card-foreground">
				{props.name}
			</h3>
			<div class="text-xs font-medium text-card-foreground">
				{props.valueLine}
			</div>
			<div class="flex min-w-0 items-center justify-between gap-3">
				<span class="min-w-0 truncate font-mono text-xs text-muted-foreground">
					{props.identifier}
				</span>
				<button
					type="button"
					class="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
