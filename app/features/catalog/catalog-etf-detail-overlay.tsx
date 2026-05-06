import type { Handle, RemixNode } from 'remix/component'
import { t } from '../../lib/i18n.ts'
import type { CatalogEntry } from './lib.ts'

const CATALOG_ETF_DIALOG_ID = 'catalog-etf-dialog'

export type CatalogEtfDetailOverlayProps = {
	entry: CatalogEntry
	closeHref: string
	/** Server-rendered ETF detail card + analysis section (no outer `<Frame>` fetch). */
	modalBody: RemixNode
}

export function CatalogEtfDetailOverlay(_handle: Handle, _setup?: unknown) {
	return (props: CatalogEtfDetailOverlayProps) => {
		const { entry, closeHref, modalBody } = props
		return (
			<dialog
				id={CATALOG_ETF_DIALOG_ID}
				class="fixed inset-0 z-50 max-h-none max-w-none overflow-x-hidden border-0 bg-transparent p-0 backdrop:bg-black/50 open:flex open:flex-col open:items-stretch open:justify-end open:overflow-x-hidden md:open:items-center md:open:justify-center md:open:px-0 md:open:py-4 [&::backdrop]:bg-black/50"
				aria-labelledby={`${CATALOG_ETF_DIALOG_ID}-title`}
				data-catalog-etf-close-href={closeHref}
			>
				<div
					class="box-border flex max-h-[min(90dvh,calc(100dvh-1rem))] w-full min-w-0 max-w-[100dvw] flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-lg md:max-h-[min(90dvh,calc(100dvh-2rem))] md:rounded-xl"
					role="document"
				>
					<header class="flex w-full min-w-0 shrink-0 items-start gap-3 overflow-hidden border-b border-border px-4 py-3">
						<div class="min-w-0 flex-1 pr-2">
							<h1
								id={`${CATALOG_ETF_DIALOG_ID}-title`}
								class="truncate text-lg font-semibold tracking-tight text-foreground"
							>
								{entry.name}
							</h1>
							<p class="truncate font-mono text-xs text-muted-foreground">
								{entry.ticker}
							</p>
						</div>
						<button
							type="button"
							class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-xl leading-none text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							data-catalog-etf-overlay-close=""
							aria-label={t('catalog.etfDetail.closeOverlay')}
						>
							<span aria-hidden="true">×</span>
						</button>
					</header>
					<div class="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overscroll-contain overflow-y-auto px-4 py-4 touch-pan-y">
						{modalBody}
					</div>
				</div>
			</dialog>
		)
	}
}

/** Stable id for tests and the overlay enhancement script. */
export function catalogEtfDialogElementId(): string {
	return CATALOG_ETF_DIALOG_ID
}
