import { Frame, type Handle } from 'remix/component'
import { Card } from '../../components/index.ts'
import { SectionIntroCard } from '../../components/section-intro-card.tsx'
import { SessionProvider } from '../../components/session-provider.tsx'
import { t } from '../../lib/i18n.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { PortfolioBuySellForm } from './add-etf-form/index.ts'
import { ImportEtfForm } from './import-etf-form/import-etf-form.tsx'

type PortfolioPageProps = {
	instrumentOptions: { value: string; label: string }[]
}

/**
 * Portfolio page: CSV import, buy/sell form, holdings list in a Frame.
 */
export function PortfolioPage(handle: Handle, _setup?: unknown) {
	return (props: PortfolioPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		return (
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
				<Card variant="muted" class="p-4">
					<h2 class="text-lg font-semibold tracking-tight text-card-foreground">
						{t('portfolio.buySell.title')}
					</h2>
					<PortfolioBuySellForm instrumentOptions={props.instrumentOptions} />
				</Card>
				<Frame
					name="portfolio-list"
					src={routes.portfolio.fragmentList.href()}
				/>
			</main>
		)
	}
}
