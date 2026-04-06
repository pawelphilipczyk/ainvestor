import { Frame, type Handle } from 'remix/component'
import { Card } from '../../components/card.tsx'
import { Link } from '../../components/link.tsx'
import { SubmitButton } from '../../components/submit-button.tsx'
import { formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { t } from '../../lib/i18n.ts'
import type { AdviceModelId } from '../advice/advice-openai.ts'
import type { CatalogEntry } from './lib.ts'

export type CatalogEtfPageProps = {
	entry: CatalogEntry
	backHref: string
	/** Shown when account is pending approval (no client analysis). */
	descriptionText?: string
	/** POST URL for on-demand AI analysis (`null` when pending). */
	analysisPostHref?: string | null
	/** GET fragment URL for Remix `<Frame>` (empty analysis until POST succeeds). */
	analysisFrameSrc?: string
	selectedModel?: AdviceModelId
}

function formatOptionalPercent(value: number): string {
	return `${new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value)}%`
}

export function CatalogEtfPage(_handle: Handle, _setup?: unknown) {
	return (props: CatalogEtfPageProps) => {
		const { entry } = props
		const typeLabel =
			formatEtfTypeLabel(entry.type) || t('catalog.etfTypeUnknown')
		const esgLabel =
			entry.esg === true
				? t('catalog.etfDetail.esgYes')
				: entry.esg === false
					? t('catalog.etfDetail.esgNo')
					: null

		const catalogRows: { label: string; value: string; valueClass?: string }[] =
			[
				{ label: t('catalog.table.ticker'), value: entry.ticker },
				{ label: t('catalog.table.name'), value: entry.name },
				{ label: t('catalog.table.type'), value: typeLabel },
				{
					label: t('catalog.table.description'),
					value:
						entry.description.trim().length > 0
							? entry.description
							: t('catalog.emptyCell'),
				},
				{
					label: t('catalog.table.isin'),
					value: entry.isin ?? t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.expenseRatio'),
					value: entry.expense_ratio ?? t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.riskKid'),
					value:
						typeof entry.risk_kid === 'number'
							? String(entry.risk_kid)
							: t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.region'),
					value: entry.region ?? t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.sector'),
					value: entry.sector ?? t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.rateOfReturn'),
					value:
						typeof entry.rate_of_return === 'number'
							? formatOptionalPercent(entry.rate_of_return)
							: t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.volatility'),
					value: entry.volatility ?? t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.returnRisk'),
					value: entry.return_risk ?? t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.fundSize'),
					value: entry.fund_size ?? t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.esg'),
					value: esgLabel ?? t('catalog.emptyCell'),
				},
				{
					label: t('catalog.etfDetail.field.id'),
					value: entry.id,
					valueClass: 'break-all font-mono text-xs',
				},
			]

		return (
			<div class="flex min-h-[calc(100dvh-7rem)] w-full min-w-0 max-w-full flex-col overflow-x-hidden">
				<header class="sticky top-0 z-20 w-full min-w-0 max-w-full border-b border-border bg-background px-4 py-3">
					<div class="mx-auto flex w-full min-w-0 max-w-3xl items-center gap-3">
						<Link
							href={props.backHref}
							navigationLoading={true}
							class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{t('catalog.etfDetail.back')}
						</Link>
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
					<Card class="min-w-0 max-w-full overflow-x-hidden p-5">
						<h2 class="text-base font-semibold tracking-tight text-card-foreground">
							{t('catalog.etfDetail.catalogCardTitle')}
						</h2>
						<dl class="mt-4">
							{catalogRows.map((row) => (
								<div
									key={row.label}
									class="grid gap-1 border-b border-border/60 py-3 last:border-0 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4"
								>
									<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										{row.label}
									</dt>
									<dd
										class={`min-w-0 text-sm text-card-foreground ${row.valueClass ?? ''}`.trim()}
									>
										{row.value}
									</dd>
								</div>
							))}
						</dl>
					</Card>

					<section
						class="min-w-0 max-w-full overflow-x-hidden"
						aria-labelledby="catalog-etf-analysis-heading"
					>
						<h2
							id="catalog-etf-analysis-heading"
							class="mb-3 text-base font-semibold tracking-tight text-card-foreground"
						>
							{t('catalog.etfDetail.analysisTitle')}
						</h2>
						{props.analysisPostHref && props.analysisFrameSrc ? (
							<>
								<form
									method="post"
									action={props.analysisPostHref}
									data-frame-submit="catalog-etf-analysis"
									data-frame-replace-from-response="1"
									class="min-w-0"
								>
									<input
										type="hidden"
										name="model"
										value={props.selectedModel ?? ''}
									/>
									<SubmitButton>
										{t('catalog.etfDetail.loadAnalysisButton')}
									</SubmitButton>
								</form>
								<Frame
									name="catalog-etf-analysis"
									src={props.analysisFrameSrc}
								/>
							</>
						) : (
							<div class="min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">
								{props.descriptionText ?? ''}
							</div>
						)}
					</section>
				</main>
			</div>
		)
	}
}
