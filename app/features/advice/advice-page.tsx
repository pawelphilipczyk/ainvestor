import type { Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	NumberInput,
	SelectInput,
	SubmitButton,
} from '../../components/index.ts'
import { CURRENCIES } from '../../lib/currencies.ts'
import { format, type MessageKey, t } from '../../lib/i18n.ts'
import {
	ADVICE_MODEL_IDS,
	type AdviceModelId,
	DEFAULT_ADVICE_MODEL,
} from '../../openai.ts'
import { routes } from '../../routes.ts'
import type { AdviceBlock, AdviceDocument } from './advice-document.ts'

type FormError = {
	summary: string
	detail?: string
}

type AdvicePageProps = {
	cashAmount?: string
	cashCurrency?: string
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

function renderAdviceBlock(block: AdviceBlock, defaultCashCurrency: string) {
	if (block.type === 'paragraph') {
		return (
			<div class="whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
				{block.text}
			</div>
		)
	}

	return (
		<section class="space-y-2">
			{block.caption ? (
				<h3 class="text-base font-semibold tracking-tight text-card-foreground">
					{block.caption}
				</h3>
			) : null}
			{block.rows.length === 0 ? (
				<p class="text-sm text-muted-foreground">{t('advice.table.empty')}</p>
			) : (
				<div class="overflow-x-auto rounded-lg border border-border">
					<table class="w-full table-auto border-collapse text-sm">
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
							</tr>
						</thead>
						<tbody>
							{block.rows.map((row) => {
								const cur =
									row.amount !== undefined
										? (row.currency ?? defaultCashCurrency)
										: null
								return (
									<tr
										key={`${row.name}-${row.ticker ?? ''}-${row.amount ?? ''}-${cur ?? ''}`}
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
											{cur ?? t('catalog.emptyCell')}
										</td>
										<td class="px-3 py-2 text-muted-foreground">
											{row.note ?? t('catalog.emptyCell')}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}
		</section>
	)
}

export function AdvicePage(_handle: Handle, _setup?: unknown) {
	return (props: AdvicePageProps) => {
		const cashCurrency = props.cashCurrency ?? 'PLN'
		const selectedModel = props.selectedModel ?? DEFAULT_ADVICE_MODEL
		const pendingApproval = props.pendingApproval === true
		return (
			<main class="mx-auto grid max-w-3xl gap-6">
				<Card class="p-6">
					<header>
						<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
							{t('advice.title')}
						</h1>
						<p class="mt-1 text-sm text-muted-foreground">
							{t('advice.subtitle')}
						</p>
					</header>
				</Card>
				{pendingApproval ? (
					<div
						role="status"
						class="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-card-foreground"
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
				<Card variant="muted" class="p-6">
					<form
						method="post"
						action={routes.advice.action.href()}
						class="space-y-4"
						data-fetch-submit
						data-replace-main
					>
						{props.formError ? (
							<div
								role="alert"
								class="rounded-md border border-destructive/50 bg-destructive/10 py-3 pl-6 pr-4 text-sm text-destructive"
							>
								{props.formError.detail ? (
									<details>
										<summary class="cursor-pointer list-inside font-medium outline-none marker:text-destructive/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
											{props.formError.summary}
										</summary>
										<pre class="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-destructive/20 pt-3 font-mono text-xs leading-relaxed text-destructive/90">
											{props.formError.detail}
										</pre>
									</details>
								) : (
									props.formError.summary
								)}
							</div>
						) : null}
						<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-2">
							<div class="grid min-w-0 flex-1 gap-2">
								<FieldLabel fieldId="cashAmount">
									{t('advice.form.field.cash')}
								</FieldLabel>
								<NumberInput
									id="cashAmount"
									name="cashAmount"
									placeholder={t('advice.form.placeholder.cash')}
									required={true}
									min={1}
									step="any"
									defaultValue={props.cashAmount}
									disabled={pendingApproval}
								/>
							</div>
							<div class="grid w-full gap-2 sm:w-36">
								<FieldLabel fieldId="cashCurrency">
									{t('advice.form.field.currency')}
								</FieldLabel>
								<SelectInput
									id="cashCurrency"
									name="cashCurrency"
									options={currencyOptions}
									value={cashCurrency}
									disabled={pendingApproval}
								/>
							</div>
							<div class="grid w-full gap-2 sm:min-w-[11rem] sm:flex-1">
								<FieldLabel fieldId="adviceModel">
									{t('advice.form.field.model')}
								</FieldLabel>
								<SelectInput
									id="adviceModel"
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
				{props.advice !== undefined && props.cashAmount ? (
					<Card class="p-6" aria-live="polite">
						<h2 class="text-lg font-semibold tracking-tight text-card-foreground">
							{t('advice.result.title')}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{format(t('advice.result.subtitle'), {
								amount: props.cashAmount,
								currency: cashCurrency,
							})}
						</p>
						<div class="mt-4 space-y-6">
							{props.advice.blocks.map((block, i) => (
								<div key={`${block.type}-${i}`}>
									{renderAdviceBlock(block, cashCurrency)}
								</div>
							))}
						</div>
					</Card>
				) : null}
			</main>
		)
	}
}
