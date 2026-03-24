import type { Handle } from 'remix/component'
import { FieldLabel, NumberInput, SelectInput } from '../../components/index.ts'
import { CURRENCIES } from '../../lib/currencies.ts'
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
}

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }))

const modelLabels: Record<AdviceModelId, string> = {
	'gpt-5.4-mini': 'GPT-5.4 Mini',
	'gpt-5.4-nano': 'GPT-5.4 Nano',
	'gpt-5.4': 'GPT-5.4',
}

const modelOptions = ADVICE_MODEL_IDS.map((id) => ({
	value: id,
	label: modelLabels[id],
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
				<p class="text-sm text-muted-foreground">
					No specific ETF proposals in this response.
				</p>
			) : (
				<div class="overflow-x-auto rounded-lg border border-border">
					<table class="w-full table-auto border-collapse text-sm">
						<caption class="sr-only">Proposed ETF investments</caption>
						<thead class="bg-muted/40">
							<tr>
								<th
									scope="col"
									class="px-3 py-2 text-left font-medium text-card-foreground"
								>
									Fund
								</th>
								<th
									scope="col"
									class="px-3 py-2 text-left font-medium text-card-foreground"
								>
									Ticker
								</th>
								<th
									scope="col"
									class="px-3 py-2 text-right font-medium text-card-foreground"
								>
									Amount
								</th>
								<th
									scope="col"
									class="px-3 py-2 text-left font-medium text-card-foreground"
								>
									Currency
								</th>
								<th
									scope="col"
									class="px-3 py-2 text-left font-medium text-card-foreground"
								>
									Note
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
											{row.ticker ?? '—'}
										</td>
										<td class="px-3 py-2 text-right tabular-nums text-card-foreground">
											{row.amount !== undefined
												? formatAmountNumber(row.amount)
												: '—'}
										</td>
										<td class="px-3 py-2 text-muted-foreground">
											{cur ?? '—'}
										</td>
										<td class="px-3 py-2 text-muted-foreground">
											{row.note ?? '—'}
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
		return (
			<main class="mx-auto max-w-3xl rounded-xl border border-border bg-card p-6 shadow-sm">
				<header>
					<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
						Get Advice
					</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Tell me how much cash you have and I'll suggest what to buy next.
					</p>
				</header>
				<form
					method="post"
					action={routes.advice.action.href()}
					class="mt-6 space-y-4"
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
							<FieldLabel fieldId="cashAmount">Available cash</FieldLabel>
							<NumberInput
								id="cashAmount"
								name="cashAmount"
								placeholder="e.g. 1000"
								required={true}
								min={1}
								step="any"
								defaultValue={props.cashAmount}
							/>
						</div>
						<div class="grid w-full gap-2 sm:w-36">
							<FieldLabel fieldId="cashCurrency">Currency</FieldLabel>
							<SelectInput
								id="cashCurrency"
								name="cashCurrency"
								options={currencyOptions}
								value={cashCurrency}
							/>
						</div>
						<div class="grid w-full gap-2 sm:min-w-[11rem] sm:flex-1">
							<FieldLabel fieldId="adviceModel">Model</FieldLabel>
							<SelectInput
								id="adviceModel"
								name="adviceModel"
								options={modelOptions}
								value={selectedModel}
							/>
						</div>
						<button
							type="submit"
							class="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Ask AI
						</button>
					</div>
				</form>
				{props.advice !== undefined && props.cashAmount ? (
					<section class="mt-8 border-t border-border pt-8" aria-live="polite">
						<h2 class="text-lg font-semibold tracking-tight">
							Investment Advice
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							Based on your portfolio and {props.cashAmount} {cashCurrency}{' '}
							available.
						</p>
						<div class="mt-4 space-y-6">
							{props.advice.blocks.map((block, i) => (
								<div key={`${block.type}-${i}`}>
									{renderAdviceBlock(block, cashCurrency)}
								</div>
							))}
						</div>
					</section>
				) : null}
			</main>
		)
	}
}
