import { Frame, type Handle } from 'remix/component'
import { Card } from '../../components/index.ts'
import { SectionIntroCard } from '../../components/section-intro-card.tsx'
import { SessionProvider } from '../../components/session-provider.tsx'
import { t } from '../../lib/i18n.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { AddEtfForm } from './add-etf-form/index.ts'
// @ts-expect-error Runtime-only JS client entry module
import { EtfCardInteractions } from './etf-card.component.js'
import { ImportEtfForm } from './import-etf-form/index.ts'

type PortfolioPageProps = {
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
					<SectionIntroCard
						page="portfolio"
						variant="page"
						title={SECTION_INTROS.portfolio.title}
						description={SECTION_INTROS.portfolio.description}
					>
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
					</SectionIntroCard>
					<ImportEtfForm />
					<Frame
						name="portfolio-list"
						src={routes.portfolio.fragmentList.href()}
					/>
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
