import type { Handle } from 'remix/ui'
import { Card, Link } from '../../components/index.ts'
import { t } from '../../lib/i18n.ts'
import { routes } from '../../routes.ts'
import { AdviceContextCopyEnhancement } from './advice-context-copy.component.js'

export type AdviceContextPageProps = {
	markdown: string
	/** Absolute URL for GET shared catalog JSON. */
	catalogJsonHref: string
	snapshotError?: boolean
}

export function AdviceContextPage(handle: Handle<AdviceContextPageProps>) {
	return () => {
		const { markdown, catalogJsonHref, snapshotError } = handle.props
		return (
			<main class="mx-auto grid w-full min-w-0 max-w-3xl gap-6">
				<script
					type="application/json"
					id="advice-context-client-messages"
					innerHTML={JSON.stringify({
						copySuccess: t('advice.context.copySuccess'),
						copyFailed: t('advice.context.copyFailed'),
					})}
				/>
				<div class="min-w-0">
					<h1 class="text-2xl font-semibold tracking-tight text-foreground">
						{t('advice.context.pageHeading')}
					</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						{t('advice.context.lead')}
					</p>
					<p class="mt-2 text-xs text-muted-foreground">
						{t('advice.context.privacyNote')}
					</p>
					<p class="mt-3 text-sm">
						<Link
							href={routes.advice.index.href()}
							class="font-medium text-primary underline-offset-4 hover:underline"
						>
							{t('advice.context.backToAdvice')}
						</Link>
					</p>
				</div>
				{snapshotError === true ? (
					<div
						role="alert"
						class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					>
						{t('advice.context.snapshotError')}
					</div>
				) : null}
				<Card class="p-4">
					<div
						data-llm-export-root
						data-catalog-json-href={catalogJsonHref}
						class="grid min-w-0 gap-6"
					>
						<div class="grid min-w-0 gap-2 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
							<p class="font-medium text-card-foreground">
								{t('advice.context.catalogJsonHeading')}
							</p>
							<p class="break-all font-mono text-xs text-muted-foreground">
								{catalogJsonHref}
							</p>
							<div class="mt-2 flex flex-wrap gap-2">
								<a
									href={catalogJsonHref}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
								>
									{t('advice.context.catalogJsonOpen')}
								</a>
								<button
									type="button"
									data-copy-catalog-json-url
									class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
								>
									{t('advice.context.copyCatalogUrl')}
								</button>
							</div>
						</div>
						<div class="grid min-w-0 gap-3">
							<label
								class="text-sm font-medium text-card-foreground"
								for="llm-export-markdown"
							>
								{t('advice.context.markdownLabel')}
							</label>
							<textarea
								id="llm-export-markdown"
								data-llm-export-markdown
								readOnly
								rows={26}
								value={markdown}
								class="min-h-[12rem] w-full min-w-0 resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
							/>
						</div>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								data-copy-llm-markdown
								class="inline-flex items-center justify-center rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							>
								{t('advice.context.copyMarkdown')}
							</button>
						</div>
					</div>
				</Card>
				<AdviceContextCopyEnhancement />
			</main>
		)
	}
}
