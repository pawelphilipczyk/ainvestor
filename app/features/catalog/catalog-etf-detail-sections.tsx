import { Frame, type Handle } from 'remix/component'
import { Card } from '../../components/data-display/card.tsx'
import { SubmitButton } from '../../components/forms/submit-button.tsx'
import { frameLoadingPlaceholder } from '../../components/layout/frame-loading-placeholder.tsx'
import { formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { t } from '../../lib/i18n.ts'
import type { AdviceModelId } from '../advice/advice-openai.ts'
import type { CatalogEntry } from './lib.ts'

function formatOptionalPercent(value: number): string {
	return `${new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value)}%`
}

export function CatalogEtfDetailCatalogCard(_handle: Handle, _setup?: unknown) {
	return (props: { entry: CatalogEntry }) => {
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
		)
	}
}

type CatalogEtfDetailAnalysisSectionProps = {
	analysisPostHref?: string | null
	analysisFrameSrc?: string
	descriptionText?: string
	selectedModel?: AdviceModelId
}

export function CatalogEtfDetailAnalysisSection(
	_handle: Handle,
	_setup?: unknown,
) {
	return (props: CatalogEtfDetailAnalysisSectionProps) => (
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
						data-frame-hide-form-on-success="1"
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
						fallback={frameLoadingPlaceholder()}
					/>
				</>
			) : (
				<div class="min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">
					{props.descriptionText ?? ''}
				</div>
			)}
		</section>
	)
}
