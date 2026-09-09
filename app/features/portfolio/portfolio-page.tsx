import { Frame, type Handle } from 'remix/ui'
import { SectionIntroCard } from '../../components/data-display/section-intro-card.tsx'
import { Card } from '../../components/index.ts'
import { frameLoadingPlaceholder } from '../../components/layout/frame-loading-placeholder.tsx'
import {
	type SessionContext,
	SessionProvider,
} from '../../components/layout/session-provider.tsx'
import { t } from '../../lib/i18n.ts'
import { getSectionIntro } from '../../lib/section-intros.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { ImportEtfForm } from './import-etf-form/import-etf-form.tsx'
import { PortfolioOperationForm } from './portfolio-operation-form/index.ts'

type PortfolioPageProps = {
	instrumentOptions: { value: string; label: string }[]
}

/**
 * Portfolio page: CSV import, operation form (buy/sell), holdings list in a Frame.
 */
export function PortfolioPage(
	handle: Handle<PortfolioPageProps, SessionContext>,
) {
	return () => {
		const props = handle.props
		const session = handle.context.get(SessionProvider)?.session ?? null
		const portfolioIntro = getSectionIntro('portfolio')
		return (
			<main class="mx-auto grid w-full min-w-0 max-w-lg gap-6">
				<SectionIntroCard
					page="portfolio"
					variant="page"
					title={portfolioIntro.title}
					description={portfolioIntro.description}
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
				<Card
					id="portfolio-operation-form"
					variant="muted"
					class="scroll-mt-4 p-4"
				>
					<h2 class="text-lg font-semibold tracking-tight text-card-foreground">
						{t('portfolio.operation.title')}
					</h2>
					<PortfolioOperationForm instrumentOptions={props.instrumentOptions} />
				</Card>
				<Frame
					name="portfolio-list"
					src={routes.portfolio.fragmentList.href()}
					fallback={frameLoadingPlaceholder()}
				/>
			</main>
		)
	}
}
