import type { Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	NumberInput,
	ScrollableTable,
	SelectInput,
	SubmitButton,
	TabLink,
	TabsNav,
} from '../../components/index.ts'
import { SectionIntroCard } from '../../components/section-intro-card.tsx'
import { CURRENCIES } from '../../lib/currencies.ts'
import { format, type MessageKey, t } from '../../lib/i18n.ts'
import { LOCALE_DECIMAL_HTML_PATTERN } from '../../lib/locale-decimal-input.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { routes } from '../../routes.ts'
import type { AdviceBlock, AdviceDocument } from './advice-document.ts'
import {
	ADVICE_MODEL_IDS,
	type AdviceAnalysisMode,
	type AdviceModelId,
	DEFAULT_ADVICE_ANALYSIS_MODE,
	DEFAULT_ADVICE_MODEL,
	normalizeAdviceAnalysisTab,
} from './advice-openai.ts'

type FormError = {
	summary: string
	detail?: string
}

function FormErrorAlert(_handle: Handle, _setup?: unknown) {
	return (props: { error: FormError }) => {
		const { error } = props
		return (
			<div
				role="alert"
				class="rounded-md border border-destructive/50 bg-destructive/10 py-3 pl-6 pr-4 text-sm text-destructive"
			>
				{error.detail ? (
					<details>
						<summary class="cursor-pointer list-inside font-medium outline-none marker:text-destructive/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
							{error.summary}
						</summary>
						<pre class="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-destructive/20 pt-3 font-mono text-xs leading-relaxed text-destructive/90">
							{error.detail}
						</pre>
					</details>
				) : (
					error.summary
				)}
			</div>
		)
	}
}

type AdvicePageProps = {
	cashAmount?: string
	cashCurrency?: string
	analysisMode?: AdviceAnalysisMode
	/** Selected tab from `?tab=` (defaults to buy_next). */
	activeTab?: AdviceAnalysisMode
	/** Which flow produced the current `advice` (for the result card). */
	lastAnalysisMode?: AdviceAnalysisMode
	selectedModel?: AdviceModelId
	advice?: AdviceDocument
	formError?: FormError
	pendingApproval?: boolean
}

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }))

const MODEL_LABEL_KEYS = {
	'gpt-5.4-mini': 'advice.model.gpt-5.4-mini',
	'gpt-5.4-nano': 'advice.model.gpt-5.4-nano',
	'gpt-5.4': 'advice.model.gpt-5.4',
} as const satisfies Record<AdviceModelId, MessageKey>

const modelOptions = ADVICE_MODEL_IDS.map((id) => ({
	value: id,
	label: t(MODEL_LABEL_KEYS[id]),
}))

function formatAmountNumber(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount)
}

function formatPctOneDecimal(n: number): string {
	return `${new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 1,
	}).format(n)}%`
}

function clampPct(n: number): number {
	if (Number.isNaN(n)) {
		return 0
	}
	return Math.min(100, Math.max(0, n))
}

function capitalSnapshotValidationMessage(
	block: Extract<AdviceBlock, { type: 'capital_snapshot' }>,
): string | null {
	const segs = block.segments
	if (segs.length !== 2) {
		return `expected exactly 2 segments, got ${segs.length}`
	}
	const holdingsN = segs.filter((s) => s.role === 'holdings').length
	const cashN = segs.filter((s) => s.role === 'cash').length
	if (holdingsN !== 1 || cashN !== 1) {
		return 'segments must include exactly one holdings and one cash role'
	}
	const currency = segs[0].currency
	if (!segs.every((s) => s.currency === currency)) {
		return 'all segment currencies must match'
	}
	if (segs.some((s) => s.amount < 0 || Number.isNaN(s.amount))) {
		return 'segment amounts must be non-negative numbers'
	}
	return null
}

function renderCapitalSnapshot(
	block: Extract<AdviceBlock, { type: 'capital_snapshot' }>,
	headingId: string,
) {
	const invalidReason = capitalSnapshotValidationMessage(block)
	if (invalidReason !== null) {
		console.warn(`[advice] capital_snapshot invalid: ${invalidReason}`)
		return (
			<section class="min-w-0 max-w-full space-y-3" aria-labelledby={headingId}>
				<h3
					id={headingId}
					class="text-base font-semibold tracking-tight text-card-foreground"
				>
					{t('advice.capital.title')}
				</h3>
				<p role="alert" class="text-sm text-muted-foreground">
					{t('advice.capital.snapshotError')}
				</p>
			</section>
		)
	}

	const total = block.segments.reduce((sum, s) => sum + s.amount, 0)
	const safeTotal = total > 0 ? total : 1

	return (
		<section class="min-w-0 max-w-full space-y-3" aria-labelledby={headingId}>
			<h3
				id={headingId}
				class="text-base font-semibold tracking-tight text-card-foreground"
			>
				{t('advice.capital.title')}
			</h3>
			<p class="sr-only">{t('advice.capital.srOnly')}</p>
			<div
				class="flex h-5 w-full min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-muted/30"
				role="img"
				aria-label={format(t('advice.capital.ariaBar'), {
					total: formatAmountNumber(total),
				})}
			>
				{block.segments.map((seg, i) => (
					<div
						key={`${seg.role}-${seg.label}-${i}`}
						class={
							seg.role === 'holdings'
								? 'min-w-0 bg-primary'
								: 'min-w-0 bg-secondary'
						}
						style={{ width: `${(seg.amount / safeTotal) * 100}%` }}
						title={format(t('advice.capital.segmentTitle'), {
							label: seg.label,
							amount: formatAmountNumber(seg.amount),
							currency: seg.currency,
						})}
					/>
				))}
			</div>
			<ul class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-card-foreground">
				{block.segments.map((seg) => (
					<li key={`${seg.role}-${seg.label}`} class="flex items-center gap-2">
						<span
							class={
								seg.role === 'holdings'
									? 'inline-block size-2.5 shrink-0 rounded-sm bg-primary'
									: 'inline-block size-2.5 shrink-0 rounded-sm bg-secondary'
							}
							aria-hidden
						/>
						<span class="font-medium">{seg.label}</span>
						<span class="tabular-nums text-muted-foreground">
							{formatAmountNumber(seg.amount)} {seg.currency}
						</span>
					</li>
				))}
			</ul>
			{block.postTotal ? (
				<p class="text-sm text-muted-foreground">
					<span class="font-medium text-card-foreground">
						{block.postTotal.label}:
					</span>{' '}
					<span class="tabular-nums">
						{formatAmountNumber(block.postTotal.amount)}{' '}
						{block.postTotal.currency}
					</span>
				</p>
			) : null}
		</section>
	)
}

function renderGuidelineBars(
	block: Extract<AdviceBlock, { type: 'guideline_bars' }>,
	headingId: string,
) {
	const trimmedCaption = block.caption?.trim()
	const titleText =
		trimmedCaption !== undefined && trimmedCaption.length > 0
			? trimmedCaption
			: t('advice.guideline.defaultCaption')

	return (
		<section class="min-w-0 max-w-full space-y-4" aria-labelledby={headingId}>
			<h3
				id={headingId}
				class="text-base font-semibold tracking-tight text-card-foreground"
			>
				{titleText}
			</h3>
			{block.rows.length === 0 ? (
				<p class="text-sm text-muted-foreground">
					{t('advice.guideline.emptyRows')}
				</p>
			) : (
				<>
					<ul class="space-y-4">
						{block.rows.map((row) => {
							const currentW = clampPct(row.currentPct)
							const postW =
								row.postBuyPct !== undefined ? clampPct(row.postBuyPct) : null
							const targetPos = clampPct(row.targetPct)
							const postBuyClause =
								row.postBuyPct !== undefined
									? format(t('advice.guideline.afterProposedBuys'), {
											post: formatPctOneDecimal(row.postBuyPct),
										})
									: ''
							const summary = `${format(t('advice.guideline.ariaSummary'), {
								current: formatPctOneDecimal(row.currentPct),
								target: formatPctOneDecimal(row.targetPct),
								postBuyClause,
							})}`
							return (
								<li key={row.label} class="space-y-1.5">
									<div class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-sm">
										<span class="min-w-0 break-words font-medium text-card-foreground">
											{row.label}
										</span>
										<span class="tabular-nums text-muted-foreground">
											{formatPctOneDecimal(row.currentPct)} →{' '}
											{formatPctOneDecimal(row.targetPct)}
											{row.postBuyPct !== undefined
												? ` → ${formatPctOneDecimal(row.postBuyPct)}`
												: null}
										</span>
									</div>
									<div
										class="relative h-3 w-full min-w-0 max-w-full overflow-hidden rounded-md bg-muted/80"
										role="img"
										aria-label={summary}
									>
										{postW !== null && postW < currentW ? (
											<>
												<div
													class="absolute inset-y-0 left-0 bg-primary/75"
													style={{ width: `${currentW}%`, zIndex: 1 }}
													aria-hidden
												/>
												<div
													class="absolute inset-y-0 left-0 bg-accent/40"
													style={{ width: `${postW}%`, zIndex: 2 }}
													aria-hidden
												/>
											</>
										) : (
											<>
												{postW !== null ? (
													<div
														class="absolute inset-y-0 left-0 bg-accent/40"
														style={{ width: `${postW}%` }}
														aria-hidden
													/>
												) : null}
												<div
													class="absolute inset-y-0 left-0 bg-primary/75"
													style={{ width: `${currentW}%` }}
													aria-hidden
												/>
											</>
										)}
										<div
											class="pointer-events-none absolute inset-y-0 w-px bg-card-foreground/90"
											style={{
												left: `clamp(0px, calc(${targetPos}% - 0.5px), calc(100% - 1px))`,
											}}
											aria-hidden
										/>
									</div>
								</li>
							)
						})}
					</ul>
					<p class="text-xs text-muted-foreground">
						{t('advice.guideline.legend')}
					</p>
				</>
			)}
		</section>
	)
}

function renderEtfProposals(
	block: Extract<AdviceBlock, { type: 'etf_proposals' }>,
	options: {
		defaultCashCurrency: string
		selectedModel: AdviceModelId
		pendingApproval: boolean
		etfInfoPostHref: string
	},
) {
	const {
		defaultCashCurrency,
		selectedModel,
		pendingApproval,
		etfInfoPostHref,
	} = options
	return (
		<section class="min-w-0 max-w-full space-y-2">
			{block.caption ? (
				<h3 class="text-base font-semibold tracking-tight text-card-foreground">
					{block.caption}
				</h3>
			) : null}
			{block.rows.length === 0 ? (
				<p class="text-sm text-muted-foreground">{t('advice.table.empty')}</p>
			) : (
				<ScrollableTable class="text-sm">
					<caption class="sr-only">{t('advice.table.caption')}</caption>
					<thead class="bg-muted/40">
						<tr>
							<th
								scope="col"
								class="px-3 py-2 text-left font-medium text-card-foreground"
							>
								{t('advice.table.fund')}
							</th>
							<th
								scope="col"
								class="px-3 py-2 text-left font-medium text-card-foreground"
							>
								{t('advice.table.ticker')}
							</th>
							<th
								scope="col"
								class="px-3 py-2 text-right font-medium text-card-foreground"
							>
								{t('advice.table.amount')}
							</th>
							<th
								scope="col"
								class="px-3 py-2 text-left font-medium text-card-foreground"
							>
								{t('advice.table.currency')}
							</th>
							<th
								scope="col"
								class="px-3 py-2 text-left font-medium text-card-foreground"
							>
								{t('advice.table.note')}
							</th>
							{pendingApproval ? null : (
								<th
									scope="col"
									class="px-3 py-2 text-left font-medium text-card-foreground"
								>
									<span class="sr-only">{t('advice.table.learnMore')}</span>
								</th>
							)}
						</tr>
					</thead>
					<tbody>
						{block.rows.map((row) => {
							const displayCurrency =
								row.amount !== undefined
									? (row.currency ?? defaultCashCurrency)
									: null
							const tickerForPayload =
								row.ticker !== undefined &&
								row.ticker.trim().length > 0 &&
								row.ticker !== t('catalog.emptyCell')
									? row.ticker.trim()
									: ''
							return (
								<tr
									key={`${row.name}-${row.ticker ?? ''}-${row.amount ?? ''}-${displayCurrency ?? ''}`}
									class="border-t border-border"
								>
									<td class="px-3 py-2 text-card-foreground">{row.name}</td>
									<td class="px-3 py-2 text-muted-foreground">
										{row.ticker ?? t('catalog.emptyCell')}
									</td>
									<td class="px-3 py-2 text-right tabular-nums text-card-foreground">
										{row.amount !== undefined
											? formatAmountNumber(row.amount)
											: t('catalog.emptyCell')}
									</td>
									<td class="px-3 py-2 text-muted-foreground">
										{displayCurrency ?? t('catalog.emptyCell')}
									</td>
									<td class="px-3 py-2 text-muted-foreground">
										{row.note ?? t('catalog.emptyCell')}
									</td>
									{pendingApproval ? null : (
										<td class="px-3 py-2 align-top">
											<button
												type="button"
												class="whitespace-nowrap rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-accent"
												data-advice-etf-learn=""
												data-post-url={etfInfoPostHref}
												data-etf-name={row.name}
												data-etf-ticker={tickerForPayload}
												data-advice-model={selectedModel}
											>
												{t('advice.table.learnMore')}
											</button>
										</td>
									)}
								</tr>
							)
						})}
					</tbody>
				</ScrollableTable>
			)}
		</section>
	)
}

function renderAdviceBlock(
	block: AdviceBlock,
	defaultCashCurrency: string,
	blockIndex: number,
	etfOptions: {
		selectedModel: AdviceModelId
		pendingApproval: boolean
		etfInfoPostHref: string
	},
) {
	if (block.type === 'paragraph') {
		return (
			<div class="min-w-0 max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">
				{block.text}
			</div>
		)
	}
	if (block.type === 'capital_snapshot') {
		return renderCapitalSnapshot(
			block,
			`advice-capital-snapshot-heading-${blockIndex}`,
		)
	}
	if (block.type === 'guideline_bars') {
		return renderGuidelineBars(
			block,
			`advice-guideline-bars-heading-${blockIndex}`,
		)
	}
	return renderEtfProposals(block, {
		defaultCashCurrency,
		selectedModel: etfOptions.selectedModel,
		pendingApproval: etfOptions.pendingApproval,
		etfInfoPostHref: etfOptions.etfInfoPostHref,
	})
}

export function AdvicePage(_handle: Handle, _setup?: unknown) {
	return (props: AdvicePageProps) => {
		const cashCurrency = props.cashCurrency ?? 'PLN'
		const selectedModel = props.selectedModel ?? DEFAULT_ADVICE_MODEL
		const activeTab = normalizeAdviceAnalysisTab(props.activeTab)
		const resultMode =
			props.advice !== undefined
				? (props.lastAnalysisMode ??
					props.analysisMode ??
					DEFAULT_ADVICE_ANALYSIS_MODE)
				: null
		const pendingApproval = props.pendingApproval === true
		const buyNextHref = routes.advice.index.href({}, { tab: 'buy_next' })
		const reviewHref = routes.advice.index.href({}, { tab: 'portfolio_review' })
		const buyNextAction = routes.advice.action.href({}, { tab: 'buy_next' })
		const reviewAction = routes.advice.action.href(
			{},
			{ tab: 'portfolio_review' },
		)
		const etfInfoPostHref = routes.advice.etfInfo.href()
		return (
			<main class="mx-auto grid w-full min-w-0 max-w-3xl gap-6">
				<SectionIntroCard
					page="advice"
					variant="page"
					title={SECTION_INTROS.advice.title}
					description={SECTION_INTROS.advice.description}
				/>
				{pendingApproval ? (
					<div
						role="status"
						class="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-card-foreground"
					>
						<p class="font-medium">{t('advice.pending.title')}</p>
						<p class="mt-1 text-muted-foreground">
							{t('advice.pending.body')}{' '}
							<code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">
								app/lib/approved-github-logins.ts
							</code>{' '}
							{t('advice.pending.afterPath')}
						</p>
					</div>
				) : null}
				<div class="flex flex-col">
					<TabsNav
						activeId={activeTab}
						aria-label={t('advice.tabs.navAria')}
						scrollGroupId="advice-analysis"
					>
						<TabLink id="buy_next" href={buyNextHref}>
							{t('advice.analysisMode.buy_next')}
						</TabLink>
						<TabLink id="portfolio_review" href={reviewHref}>
							{t('advice.analysisMode.portfolio_review')}
						</TabLink>
					</TabsNav>
					{activeTab === 'buy_next' ? (
						<Card variant="muted" class="rounded-t-none border-t-0 p-6">
							<form
								method="post"
								action={buyNextAction}
								class="space-y-4"
								data-fetch-submit
								data-replace-main
							>
								<input type="hidden" name="analysisMode" value="buy_next" />
								{props.formError ? (
									<FormErrorAlert error={props.formError} />
								) : null}
								<p class="text-xs text-muted-foreground">
									{t('advice.tab.hint.buyNext')}
								</p>
								<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-2">
									<div class="grid min-w-0 flex-1 gap-2">
										<FieldLabel fieldId="cashAmount-buy-next">
											{t('advice.form.field.cash')}
										</FieldLabel>
										<NumberInput
											id="cashAmount-buy-next"
											name="cashAmount"
											placeholder={t('advice.form.placeholder.cash')}
											required={true}
											min={1}
											step="any"
											inputMode="decimal"
											pattern={LOCALE_DECIMAL_HTML_PATTERN}
											defaultValue={props.cashAmount}
											disabled={pendingApproval}
										/>
									</div>
									<div class="grid w-full gap-2 sm:w-36">
										<FieldLabel fieldId="cashCurrency-buy-next">
											{t('advice.form.field.currency')}
										</FieldLabel>
										<SelectInput
											id="cashCurrency-buy-next"
											name="cashCurrency"
											options={currencyOptions}
											value={cashCurrency}
											disabled={pendingApproval}
										/>
									</div>
									<div class="grid w-full gap-2 sm:min-w-[11rem] sm:flex-1">
										<FieldLabel fieldId="adviceModel-buy-next">
											{t('advice.form.field.model')}
										</FieldLabel>
										<SelectInput
											id="adviceModel-buy-next"
											name="adviceModel"
											options={modelOptions}
											value={selectedModel}
											disabled={pendingApproval}
										/>
									</div>
									<SubmitButton
										disabled={pendingApproval}
										class="sm:!w-auto sm:shrink-0"
									>
										{t('advice.form.submit')}
									</SubmitButton>
								</div>
							</form>
						</Card>
					) : (
						<Card variant="muted" class="rounded-t-none border-t-0 p-6">
							<form
								method="post"
								action={reviewAction}
								class="space-y-4"
								data-fetch-submit
								data-replace-main
							>
								<input
									type="hidden"
									name="analysisMode"
									value="portfolio_review"
								/>
								{props.formError ? (
									<FormErrorAlert error={props.formError} />
								) : null}
								<p class="text-xs text-muted-foreground">
									{t('advice.tab.hint.portfolioReview')}
								</p>
								<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-2">
									<div class="grid w-full gap-2 sm:min-w-[11rem] sm:flex-1">
										<FieldLabel fieldId="adviceModel-review">
											{t('advice.form.field.model')}
										</FieldLabel>
										<SelectInput
											id="adviceModel-review"
											name="adviceModel"
											options={modelOptions}
											value={selectedModel}
											disabled={pendingApproval}
										/>
									</div>
									<SubmitButton
										disabled={pendingApproval}
										class="sm:!w-auto sm:shrink-0"
									>
										{t('advice.form.submit')}
									</SubmitButton>
								</div>
							</form>
						</Card>
					)}
				</div>
				{props.advice !== undefined &&
				resultMode !== null &&
				(props.cashAmount !== undefined ||
					resultMode === 'portfolio_review') ? (
					<Card class="min-w-0 max-w-full p-6" aria-live="polite">
						<h2 class="text-lg font-semibold tracking-tight text-card-foreground">
							{resultMode === 'portfolio_review'
								? t('advice.result.titleReview')
								: t('advice.result.title')}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{resultMode === 'portfolio_review'
								? t('advice.result.subtitleReviewGuidelinesOnly')
								: format(t('advice.result.subtitle'), {
										amount: props.cashAmount ?? '',
										currency: cashCurrency,
									})}
						</p>
						<div class="mt-4 min-w-0 space-y-6">
							{props.advice.blocks.map((block, i) => (
								<div key={`${block.type}-${i}`} class="min-w-0 max-w-full">
									{renderAdviceBlock(block, cashCurrency, i, {
										selectedModel,
										pendingApproval,
										etfInfoPostHref,
									})}
								</div>
							))}
						</div>
					</Card>
				) : null}
			</main>
		)
	}
}
