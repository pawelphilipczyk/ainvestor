import type { Handle } from 'remix/component'
import { SessionProvider } from '../../components/session-provider.tsx'
import type { EtfEntry } from '../../lib/gist.ts'
import { AddEtfForm, ListFragment } from './add-etf-form/index.ts'
// @ts-expect-error Runtime-only JS client entry module
import { EtfCardInteractions } from './etf-card.component.js'
import { ImportEtfForm } from './import-etf-form/index.ts'

type PortfolioPageProps = {
	entries: EtfEntry[]
	instrumentOptions: { value: string; label: string }[]
}

/**
 * Portfolio page main content: CSV import (primary), list, optional manual add form.
 * Session from SessionProvider context.
 */
export function PortfolioPage(handle: Handle, _setup?: unknown) {
	return (props: PortfolioPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		return (
			<>
				<main class="mx-auto w-full min-w-0 max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
					<header>
						<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
							AI Investor
						</h1>
						<p class="mt-1 text-sm text-muted-foreground">
							Paste or upload a broker CSV to add what you already hold or want
							to buy.
						</p>
						{session ? (
							<p class="mt-1 text-xs text-muted-foreground">
								Saved to your private GitHub Gist
							</p>
						) : (
							<p class="mt-1 text-xs text-muted-foreground">
								Sign in to persist your data across sessions
							</p>
						)}
					</header>

					<ImportEtfForm />

					<div id="portfolio-list">
						<ListFragment entries={props.entries} />
					</div>

					<details class="mt-6 rounded-lg border border-border bg-muted/20 p-4">
						<summary class="cursor-pointer text-sm font-medium text-card-foreground outline-none marker:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
							Add one ETF manually
						</summary>
						<AddEtfForm instrumentOptions={props.instrumentOptions} />
					</details>
				</main>
				<EtfCardInteractions />
			</>
		)
	}
}
