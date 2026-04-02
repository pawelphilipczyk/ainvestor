import type { Handle } from 'remix/component'
import { Link } from '../../components/link.tsx'
import { t } from '../../lib/i18n.ts'

export type CatalogEtfPageProps = {
	fundName: string
	descriptionText: string
	backHref: string
	serviceError?: boolean
}

export function CatalogEtfPage(_handle: Handle, _setup?: unknown) {
	return (props: CatalogEtfPageProps) => (
		<div class="flex min-h-[calc(100dvh-7rem)] min-w-0 flex-col">
			<header class="sticky top-0 z-20 border-b border-border bg-background px-4 py-3 md:ml-64">
				<div class="mx-auto flex min-w-0 max-w-3xl items-center gap-3">
					<Link
						href={props.backHref}
						navigationLoading={true}
						class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{t('catalog.etfDetail.back')}
					</Link>
					<h1 class="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">
						{props.fundName}
					</h1>
				</div>
			</header>
			<main class="mx-auto min-w-0 max-w-3xl flex-1 px-4 py-6">
				{props.serviceError ? (
					<p role="alert" class="text-sm text-destructive">
						{t('errors.catalog.etfDetail.service')}
					</p>
				) : (
					<div class="whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">
						{props.descriptionText}
					</div>
				)}
			</main>
		</div>
	)
}
