import type { Handle } from 'remix/component'
import { t } from '../../lib/i18n.ts'
import type { AdviceModelId } from '../advice/advice-openai.ts'
// @ts-expect-error Runtime-only remix clientEntry (scoped to this page)
import { CatalogEtfBackEnhancement } from './catalog-etf-back.component.js'
import {
	CatalogEtfDetailAnalysisSection,
	CatalogEtfDetailCatalogCard,
} from './catalog-etf-detail-sections.tsx'
import type { CatalogEntry } from './lib.ts'

export type CatalogEtfPageProps = {
	entry: CatalogEntry
	/** Used when the browser has no session history to go back to (e.g. new tab). */
	catalogFallbackHref: string
	/** Shown when account is pending approval (no client analysis). */
	descriptionText?: string
	/** POST URL for on-demand AI analysis (`null` when pending). */
	analysisPostHref?: string | null
	/** GET fragment URL for Remix `<Frame>` (empty analysis until POST succeeds). */
	analysisFrameSrc?: string
	selectedModel?: AdviceModelId
	/** Full-page layout with sticky header; omit for embedded overlay content. */
	fullPage?: boolean
}

export function CatalogEtfPage(_handle: Handle, _setup?: unknown) {
	return (props: CatalogEtfPageProps) => {
		const { entry } = props
		const fullPage = props.fullPage !== false

		const body = (
			<>
				<CatalogEtfDetailCatalogCard entry={entry} />
				<CatalogEtfDetailAnalysisSection
					analysisPostHref={props.analysisPostHref}
					analysisFrameSrc={props.analysisFrameSrc}
					descriptionText={props.descriptionText}
					selectedModel={props.selectedModel}
				/>
			</>
		)

		if (!fullPage) {
			return (
				<div class="min-w-0 max-w-full space-y-6 overflow-x-hidden">{body}</div>
			)
		}

		return (
			<div class="flex min-h-[calc(100dvh-7rem)] w-full min-w-0 max-w-full flex-col overflow-x-hidden">
				<header class="sticky top-0 z-20 w-full min-w-0 max-w-full border-b border-border bg-background px-4 py-3">
					<div class="mx-auto flex w-full min-w-0 max-w-3xl items-center gap-3">
						<a
							href={props.catalogFallbackHref}
							rmx-document
							class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							data-catalog-etf-back=""
						>
							{t('catalog.etfDetail.back')}
						</a>
						<div class="min-w-0">
							<h1 class="truncate text-lg font-semibold tracking-tight text-foreground">
								{entry.name}
							</h1>
							<p class="truncate font-mono text-xs text-muted-foreground">
								{entry.ticker}
							</p>
						</div>
					</div>
				</header>
				<main class="mx-auto w-full min-w-0 max-w-3xl flex-1 space-y-6 overflow-x-hidden px-4 py-6">
					{body}
				</main>
				<CatalogEtfBackEnhancement />
			</div>
		)
	}
}
