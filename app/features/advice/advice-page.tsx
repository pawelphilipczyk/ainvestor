import type { Handle } from 'remix/component'
import { routes } from '../../routes.ts'

type AdvicePageProps = {
	cashAmount: string
	advice: string
}

export function AdvicePage(_handle: Handle, _setup?: unknown) {
	return (props: AdvicePageProps) => (
		<main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
			<h1 class="text-2xl font-bold tracking-tight">Investment Advice</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Based on your portfolio and ${props.cashAmount} available.
			</p>
			<div class="mt-6 whitespace-pre-wrap text-sm leading-relaxed">
				{props.advice}
			</div>
			<a
				href={routes.portfolio.index.href()}
				class="mt-6 inline-block text-sm underline underline-offset-4"
			>
				← Back to portfolio
			</a>
		</main>
	)
}
