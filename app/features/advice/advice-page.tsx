import type { Handle } from 'remix/component'
import { FieldLabel, NumberInput } from '../../components/index.ts'
import { routes } from '../../routes.ts'

type FormError = {
	summary: string
	detail?: string
}

type AdvicePageProps = {
	cashAmount?: string
	advice?: string
	formError?: FormError
}

export function AdvicePage(_handle: Handle, _setup?: unknown) {
	return (props: AdvicePageProps) => (
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
						class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					>
						{props.formError.detail ? (
							<details>
								<summary class="cursor-pointer list-outside font-medium outline-none marker:text-destructive/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
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
					<FieldLabel fieldId="cashAmount" variant="screenReader">
						Available cash (USD)
					</FieldLabel>
					<div class="min-w-0 flex-1">
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
						Based on your portfolio and ${props.cashAmount} available.
					</p>
					<div class="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
						{props.advice}
					</div>
				</section>
			) : null}
		</main>
	)
}
