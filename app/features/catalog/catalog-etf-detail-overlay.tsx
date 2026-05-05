import { Frame, type Handle } from 'remix/component'
import { frameLoadingPlaceholder } from '../../components/layout/frame-loading-placeholder.tsx'
import { t } from '../../lib/i18n.ts'
import type { CatalogEntry } from './lib.ts'
// @ts-expect-error Runtime-only remix clientEntry
import { CatalogEtfOverlayEnhancement } from './catalog-etf-overlay.component.js'

const CATALOG_ETF_DIALOG_ID = 'catalog-etf-dialog'
const CATALOG_ETF_MODAL_BODY_FRAME = 'catalog-etf-modal-body'

export type CatalogEtfDetailOverlayProps = {
	entry: CatalogEntry
	closeHref: string
	/** GET URL for `<Frame>` loading ETF detail UI + nested analysis frame. */
	modalBodyFrameSrc: string
}

export function CatalogEtfDetailOverlay(_handle: Handle, _setup?: unknown) {
	return (props: CatalogEtfDetailOverlayProps) => {
		const { entry, closeHref, modalBodyFrameSrc } = props
		return (
			<dialog
				id={CATALOG_ETF_DIALOG_ID}
				class="fixed inset-0 z-50 max-h-none max-w-none border-0 bg-transparent p-0 backdrop:bg-black/50 open:flex open:flex-col open:items-stretch open:justify-end md:open:items-center md:open:justify-center md:open:p-4 [&::backdrop]:bg-black/50"
				aria-labelledby={`${CATALOG_ETF_DIALOG_ID}-title`}
				data-catalog-etf-close-href={closeHref}
			>
				<div
					class="flex max-h-[min(90dvh,calc(100dvh-1rem))] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-lg md:max-h-[min(90dvh,calc(100dvh-2rem))] md:max-w-2xl md:rounded-xl"
					role="document"
				>
					<header class="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
						<a
							href={closeHref}
							rmx-document
							class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							data-catalog-etf-overlay-close=""
						>
							{t('catalog.etfDetail.closeOverlay')}
						</a>
						<div class="min-w-0">
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
					</header>
					<div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 py-4">
						<Frame
							name={CATALOG_ETF_MODAL_BODY_FRAME}
							src={modalBodyFrameSrc}
							fallback={frameLoadingPlaceholder()}
						/>
					</div>
				</div>
				<CatalogEtfOverlayEnhancement />
			</dialog>
		)
	}
}

/** Stable id for tests and the overlay enhancement script. */
export function catalogEtfDialogElementId(): string {
	return CATALOG_ETF_DIALOG_ID
}
