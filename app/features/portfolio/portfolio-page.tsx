import type { Handle } from 'remix/component'
import { Card } from '../../components/index.ts'
import { SessionProvider } from '../../components/session-provider.tsx'
import type { EtfEntry } from '../../lib/gist.ts'
import { t } from '../../lib/i18n.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
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
				<main class="mx-auto grid w-full min-w-0 max-w-lg gap-6">
					<Card class="p-6">
						<header>
							<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
								{t('portfolio.title')}
							</h1>
							<p class="mt-1 text-sm text-muted-foreground">
								{t('portfolio.subtitle')}
							</p>
							{sessionUsesGithubGist(session) ? (
								<p class="mt-1 text-xs text-muted-foreground">
									{t('portfolio.savedGist')}
								</p>
							) : session?.approvalStatus === 'pending' ? (
								<p class="mt-1 text-xs text-muted-foreground">
									{t('portfolio.pendingNotSaved')}
								</p>
							) : (
								<p class="mt-1 text-xs text-muted-foreground">
									{t('portfolio.signInPersist')}
								</p>
							)}
						</header>
					</Card>
					<ImportEtfForm />
					<div id="portfolio-list">
						<ListFragment entries={props.entries} />
					</div>
					<Card as="details" variant="muted" class="p-4">
						<summary class="cursor-pointer text-sm font-medium text-card-foreground outline-none marker:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
							{t('portfolio.addManual.summary')}
						</summary>
						<AddEtfForm instrumentOptions={props.instrumentOptions} />
					</Card>
				</main>
				<EtfCardInteractions />
			</>
		)
	}
}
