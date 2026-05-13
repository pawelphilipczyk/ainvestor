import { Frame, type Handle } from 'remix/ui'
import { SectionIntroCard } from '../../components/data-display/section-intro-card.tsx'
import {
	Card,
	FieldLabel,
	Link,
	NumberInput,
	ScrollableTable,
	SelectInput,
	SubmitButton,
	TabLink,
	TabsNav,
} from '../../components/index.ts'
import { frameLoadingPlaceholder } from '../../components/layout/frame-loading-placeholder.tsx'
import { CURRENCIES } from '../../lib/currencies.ts'
import { format, type MessageKey, t } from '../../lib/i18n.ts'
import { LOCALE_DECIMAL_HTML_PATTERN } from '../../lib/locale-decimal-input.ts'
import { getSectionIntro } from '../../lib/section-intros.ts'
import { routes } from '../../routes.ts'
import type { CatalogEntry } from '../catalog/lib.ts'
import { findCatalogEntryByTicker } from '../catalog/lib.ts'
import type {
	AdviceBlock,
	AdviceDocument,
	AdviceEtfProposalRow,
} from './advice-document.ts'
import {
	ADVICE_MODEL_IDS,
	type AdviceAnalysisMode,
	type AdviceModelId,
	DEFAULT_ADVICE_ANALYSIS_MODE,
	DEFAULT_ADVICE_MODEL,
	normalizeAdviceAnalysisTab,
} from './advice-openai.ts'

/** Same max-width tokens as catalog list tables (`catalog-list-fragment.tsx`) for apples-to-apples layout. */
const adviceTableTextColMax = 'max-w-48 sm:max-w-56 md:max-w-xs lg:max-w-sm'

type FormError = {
	summary: string
	detail?: string
}

function FormErrorAlert(handle: Handle<{ error: FormError }>) {
	return () => {
		const { error } = handle.props
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
	/** Shared catalog for resolving ETF detail links on proposal rows. */
	catalog?: CatalogEntry[]
	/** Last run was loaded from `advice-analysis.json` in the user gist. */
	adviceFromGist?: boolean
	/** ISO timestamp when gist snapshot was written (for notice line). */
	adviceGistSavedAt?: string
	/** Saving to gist failed; this run is visible until reload only. */
	adviceGistPersistFailed?: boolean
	formError?: FormError
	pendingApproval?: boolean
	/** Guest or signed-in user without a private gist — forms disabled; explain sign-in / Portfolio. */
	adviceGistGate?: 'sign_in' | 'connect_gist'
	/** When set, analysis results load inside a Remix `<Frame>` at this URL. */
	adviceResultFrameSrc?: string
}

type AdviceAccessBanner =
	| 'none'
	| 'pending_approval'
	| 'sign_in_for_gist'
	| 'connect_gist'

function adviceAccessBannerFromProps(props: {
	pendingApproval?: boolean
	adviceGistGate?: 'sign_in' | 'connect_gist'
}): AdviceAccessBanner {
	if (props.pendingApproval === true) return 'pending_approval'
	if (props.adviceGistGate === 'sign_in') return 'sign_in_for_gist'
	if (props.adviceGistGate === 'connect_gist') return 'connect_gist'
	return 'none'
}

function resolveProposalEtfDetailsCatalogEntryId(
	catalog: CatalogEntry[] | undefined,
	row: AdviceEtfProposalRow,
): string | null {
	if (catalog === undefined || catalog.length === 0) return null
	const fromModel = row.catalogEntryId?.trim()
	if (fromModel !== undefined && fromModel.length > 0) {
		if (catalog.some((entry) => entry.id === fromModel)) return fromModel
	}
	const ticker =
		row.ticker !== undefined &&
		row.ticker.trim().length > 0 &&
		row.ticker !== t('catalog.emptyCell')
			? row.ticker.trim()
			: null
	if (ticker === null) return null
	const match = findCatalogEntryByTicker(catalog, ticker)
	return match?.id ?? null
}

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }))

const MODEL_LABEL_KEYS = {
	'gpt-5.5': 'advice.model.gpt-5.5',
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
		catalog: CatalogEntry[] | undefined
	},
) {
	const { defaultCashCurrency, selectedModel, pendingApproval, catalog } =
		options
	const tableColSpan = 5
	const fundNameLinkClass =
		'text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
	return (
		<section>
			{block.caption ? (
				<h2 class="text-base font-semibold tracking-tight text-card-foreground">
					{block.caption}
				</h2>
			) : null}
			{block.rows.length === 0 ? (
				<p class="text-sm text-muted-foreground">{t('advice.table.empty')}</p>
			) : (
				<ScrollableTable wrapperClass="mt-3" class="text-sm">
					<caption class="sr-only">{t('advice.table.caption')}</caption>
					<thead class="bg-muted/40 px-4">
						<tr>
							<td colspan={tableColSpan} class="h-1" />
						</tr>
						<tr class="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
							<th
								scope="col"
								class={`pb-2 pl-4 pr-4 align-top ${adviceTableTextColMax}`}
							>
								{t('advice.table.fund')}
							</th>
							<th scope="col" class="pb-2 pr-4 align-top">
								{t('advice.table.ticker')}
							</th>
							<th scope="col" class="pb-2 pr-4 align-top text-right">
								{t('advice.table.amount')}
							</th>
							<th scope="col" class="pb-2 pr-4 align-top">
								{t('advice.table.currency')}
							</th>
							<th
								scope="col"
								class={`pb-2 pr-4 align-top ${adviceTableTextColMax}`}
							>
								{t('advice.table.note')}
							</th>
						</tr>
					</thead>
					<tbody>
						{block.rows.map((row) => {
							const displayCurrency =
								row.amount !== undefined
									? (row.currency ?? defaultCashCurrency)
									: null
							const catalogEntryId = resolveProposalEtfDetailsCatalogEntryId(
								catalog,
								row,
							)
							const etfDetailsHref =
								catalogEntryId !== null
									? routes.catalog.etf.href(
											{ catalogEntryId },
											{ model: selectedModel },
										)
									: null
							const fundCell =
								!pendingApproval && etfDetailsHref !== null ? (
									<Link
										href={etfDetailsHref}
										navigationLoading={true}
										class={fundNameLinkClass}
										aria-label={format(t('advice.table.fundLinkAria'), {
											name: row.name,
										})}
									>
										{row.name}
									</Link>
								) : (
									row.name
								)
							return (
								<tr
									key={`${row.name}-${row.ticker ?? ''}-${row.amount ?? ''}-${displayCurrency ?? ''}`}
									class="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
								>
									<td
										class={`py-2 pr-4 align-top text-sm break-words text-card-foreground ${adviceTableTextColMax}`}
									>
										{fundCell}
									</td>
									<td class="py-2 pl-4 pr-4 align-top font-mono text-sm font-semibold text-muted-foreground">
										{row.ticker ?? t('catalog.emptyCell')}
									</td>
									<td class="py-2 pr-4 align-top text-right text-sm tabular-nums text-card-foreground">
										{row.amount !== undefined
											? formatAmountNumber(row.amount)
											: t('catalog.emptyCell')}
									</td>
									<td class="py-2 pr-4 align-top text-sm text-muted-foreground">
										{displayCurrency ?? t('catalog.emptyCell')}
									</td>
									<td
										class={`py-2 pr-4 align-top text-sm break-words text-muted-foreground ${adviceTableTextColMax}`}
									>
										{row.note ?? t('catalog.emptyCell')}
									</td>
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
		catalog: CatalogEntry[] | undefined
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
		catalog: etfOptions.catalog,
	})
}

export type AdviceResultCardProps = {
	advice: AdviceDocument
	lastAnalysisMode?: AdviceAnalysisMode
	analysisMode?: AdviceAnalysisMode
	cashAmount?: string
	cashCurrency?: string
	selectedModel?: AdviceModelId
	catalog?: CatalogEntry[]
	adviceFromGist?: boolean
	adviceGistSavedAt?: string
	adviceGistPersistFailed?: boolean
	pendingApproval?: boolean
	adviceGistGate?: 'sign_in' | 'connect_gist'
}

function adviceResultCardView(props: AdviceResultCardProps) {
	const cashCurrency = props.cashCurrency ?? 'PLN'
	const selectedModel = props.selectedModel ?? DEFAULT_ADVICE_MODEL
	const resultMode =
		props.lastAnalysisMode ?? props.analysisMode ?? DEFAULT_ADVICE_ANALYSIS_MODE
	const pendingApproval = props.pendingApproval === true
	const adviceGistGate = props.adviceGistGate
	return (
		<Card class="min-w-0 p-4" aria-live="polite">
			{props.adviceGistPersistFailed === true ? (
				<p
					class="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-card-foreground"
					role="status"
				>
					{t('advice.persistFailed.notice')}
				</p>
			) : null}
			{props.adviceFromGist === true &&
			props.adviceGistSavedAt !== undefined &&
			props.adviceGistSavedAt.length > 0 ? (
				<p
					class="mb-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
					role="status"
				>
					{format(t('advice.restore.fromGistNotice'), {
						savedAt: props.adviceGistSavedAt,
					})}
				</p>
			) : null}
			<h2 class="text-base font-semibold tracking-tight text-card-foreground">
				{resultMode === 'portfolio_review'
					? t('advice.result.titleReview')
					: t('advice.result.title')}
			</h2>
			<p class="mt-0.5 text-xs text-muted-foreground">
				{resultMode === 'portfolio_review'
					? t('advice.result.subtitleReviewGuidelinesOnly')
					: format(t('advice.result.subtitle'), {
							amount: props.cashAmount ?? '',
							currency: cashCurrency,
						})}
			</p>
			<div class="mt-3 space-y-6">
				{props.advice.blocks.map((block, i) => (
					<div key={`${block.type}-${i}`}>
						{renderAdviceBlock(block, cashCurrency, i, {
							selectedModel,
							pendingApproval: pendingApproval || adviceGistGate !== undefined,
							catalog: props.catalog,
						})}
					</div>
				))}
			</div>
		</Card>
	)
}

export function AdviceResultCard(handle: Handle<AdviceResultCardProps>) {
	return () => adviceResultCardView(handle.props)
}

export function AdvicePage(handle: Handle<AdvicePageProps>) {
	return () => {
		const props = handle.props
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
		const adviceGistGate = props.adviceGistGate
		const adviceFormDisabled = pendingApproval || adviceGistGate !== undefined
		const buyNextHref = routes.advice.index.href({}, { tab: 'buy_next' })
		const reviewHref = routes.advice.index.href({}, { tab: 'portfolio_review' })
		const buyNextAction = routes.advice.action.href({}, { tab: 'buy_next' })
		const reviewAction = routes.advice.action.href(
			{},
			{ tab: 'portfolio_review' },
		)
		const frameSrc = props.adviceResultFrameSrc
		const accessBanner = adviceAccessBannerFromProps(props)
		const adviceIntro = getSectionIntro('advice')
		return (
			<main class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
				<div class="min-w-0 w-full">
					<SectionIntroCard
						page="advice"
						variant="page"
						title={adviceIntro.title}
						description={adviceIntro.description}
					/>
				</div>
				{accessBanner === 'pending_approval' ? (
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
				) : accessBanner === 'sign_in_for_gist' ? (
					<div
						role="status"
						class="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-card-foreground"
					>
						<p class="font-medium">{t('advice.requiresGist.title')}</p>
						<p class="mt-1 text-muted-foreground">
							{t('advice.requiresGist.bodySignIn')}
						</p>
						<p class="mt-3">
							<Link
								href={routes.auth.login.href()}
								class="font-medium text-primary underline-offset-4 hover:underline"
							>
								{t('advice.requiresGist.linkSignIn')}
							</Link>
						</p>
					</div>
				) : accessBanner === 'connect_gist' ? (
					<div
						role="status"
						class="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-card-foreground"
					>
						<p class="font-medium">{t('advice.requiresGist.title')}</p>
						<p class="mt-1 text-muted-foreground">
							{t('advice.requiresGist.bodyConnectGist')}
						</p>
						<p class="mt-3">
							<Link
								href={routes.portfolio.index.href()}
								class="font-medium text-primary underline-offset-4 hover:underline"
							>
								{t('advice.requiresGist.linkPortfolio')}
							</Link>
						</p>
					</div>
				) : null}
				<div class="flex min-w-0 w-full flex-col">
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
						<Card variant="muted" class="min-w-0 rounded-t-none border-t-0 p-6">
							<form
								method="post"
								action={buyNextAction}
								class="space-y-4"
								data-frame-submit="advice-result"
								data-frame-reload-src={frameSrc ?? ''}
							>
								<input type="hidden" name="analysisMode" value="buy_next" />
								<input type="hidden" name="adviceIntent" value="run" />
								{props.formError ? (
									<FormErrorAlert error={props.formError} />
								) : null}
								<p class="text-xs text-muted-foreground">
									{t('advice.tab.hint.buyNext')}
								</p>
								<div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-2">
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
											disabled={adviceFormDisabled}
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
											disabled={adviceFormDisabled}
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
											disabled={adviceFormDisabled}
										/>
									</div>
									<SubmitButton
										disabled={adviceFormDisabled}
										class="sm:!w-auto sm:shrink-0"
									>
										{t('advice.form.submit')}
									</SubmitButton>
								</div>
							</form>
						</Card>
					) : (
						<Card variant="muted" class="min-w-0 rounded-t-none border-t-0 p-6">
							{props.advice !== undefined ? (
								<form
									method="post"
									action={reviewAction}
									class="mb-4"
									data-frame-submit="advice-result"
									data-frame-reload-src={frameSrc ?? ''}
								>
									<input
										type="hidden"
										name="analysisMode"
										value="portfolio_review"
									/>
									<input type="hidden" name="adviceIntent" value="clear" />
									<button
										type="submit"
										disabled={adviceFormDisabled}
										class="inline-flex h-10 min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
									>
										{t('advice.portfolioReview.clearStored')}
									</button>
								</form>
							) : null}
							<form
								method="post"
								action={reviewAction}
								class="space-y-4"
								data-frame-submit="advice-result"
								data-frame-reload-src={frameSrc ?? ''}
							>
								<input
									type="hidden"
									name="analysisMode"
									value="portfolio_review"
								/>
								<input type="hidden" name="adviceIntent" value="run" />
								{props.formError ? (
									<FormErrorAlert error={props.formError} />
								) : null}
								<p class="text-xs text-muted-foreground">
									{t('advice.tab.hint.portfolioReview')}
								</p>
								<div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-2">
									<div class="grid min-w-0 w-full gap-2 sm:min-w-[11rem] sm:flex-1">
										<FieldLabel fieldId="adviceModel-review">
											{t('advice.form.field.model')}
										</FieldLabel>
										<SelectInput
											id="adviceModel-review"
											name="adviceModel"
											options={modelOptions}
											value={selectedModel}
											disabled={adviceFormDisabled}
										/>
									</div>
									<SubmitButton
										disabled={adviceFormDisabled}
										class="sm:!w-auto sm:shrink-0"
									>
										{props.advice !== undefined
											? t('advice.form.submitPortfolioRegenerate')
											: t('advice.form.submit')}
									</SubmitButton>
								</div>
							</form>
						</Card>
					)}
				</div>
				{frameSrc !== undefined ? (
					<Frame
						name="advice-result"
						src={frameSrc}
						fallback={frameLoadingPlaceholder()}
					/>
				) : props.advice !== undefined &&
					resultMode !== null &&
					(props.cashAmount !== undefined ||
						resultMode === 'portfolio_review') ? (
					<AdviceResultCard
						advice={props.advice}
						lastAnalysisMode={props.lastAnalysisMode}
						analysisMode={props.analysisMode}
						cashAmount={props.cashAmount}
						cashCurrency={cashCurrency}
						selectedModel={selectedModel}
						catalog={props.catalog}
						adviceFromGist={props.adviceFromGist}
						adviceGistSavedAt={props.adviceGistSavedAt}
						adviceGistPersistFailed={props.adviceGistPersistFailed}
						pendingApproval={pendingApproval}
						adviceGistGate={adviceGistGate}
					/>
				) : null}
			</main>
		)
	}
}
