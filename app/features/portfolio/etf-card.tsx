import type { Handle } from 'remix/component'
import { Card } from '../../components/index.ts'
import { routes } from '../../routes.ts'
import { Badge } from './badge.tsx'

type EtfCardProps = {
	name: string
	details: string
	badgeValue: string
	dialogId: string
	deleteHref: string
}

/**
 * Server-rendered ETF card for portfolio list.
 * Interactivity is provided by EtfCardInteractions (clientEntry) in etf-card.component.js.
 */
export function EtfCard(_handle: Handle, _setup?: unknown) {
	return (props: EtfCardProps) => (
		<Card
			as="li"
			class="flex min-w-0 items-center justify-between gap-3 px-4 py-3"
		>
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<strong class="truncate font-semibold text-card-foreground">
					{props.name}
				</strong>
				<span class="truncate text-xs text-muted-foreground">
					{props.details}
				</span>
			</div>
			<div class="flex shrink-0 items-center gap-3">
				<Badge>{props.badgeValue}</Badge>
				<button
					type="button"
					class="etf-remove-trigger rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
					aria-label={`Remove ${props.name} from portfolio`}
					data-dialog-id={props.dialogId}
				>
					Sell
				</button>
			</div>
			<dialog
				id={props.dialogId}
				class="rounded-lg border border-border bg-card p-4 shadow-lg backdrop:bg-black/50"
			>
				<p class="mb-4 text-sm text-card-foreground">
					Remove <strong>{props.name}</strong> from your portfolio?
				</p>
				<div class="flex justify-end gap-2">
					<form method="dialog">
						<button
							type="submit"
							class="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-accent"
						>
							Cancel
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
							Remove
						</button>
					</form>
				</div>
			</dialog>
		</Card>
	)
}
