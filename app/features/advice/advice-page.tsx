import type { Handle } from 'remix/component'
import { FieldLabel, NumberInput } from '../../components/index.ts'
import { routes } from '../../routes.ts'

/** GET /advice: entry point for advice. POST responses use `AdviceResultPage`. */
export function AdvicePage(_handle: Handle, _setup?: unknown) {
	return () => (
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
				class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-2"
				data-fetch-submit
				data-replace-main
			>
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
					/>
				</div>
				<button
					type="submit"
					class="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Ask AI
				</button>
			</form>
		</main>
	)
}
