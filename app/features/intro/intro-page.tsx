import type { Handle } from 'remix/ui'
import { SectionIntroCard } from '../../components/data-display/section-intro-card.tsx'
import type { SessionContext } from '../../components/layout/session-provider.tsx'
import { SessionProvider } from '../../components/layout/session-provider.tsx'
import { getNavLinks } from '../../components/layout/sidebar-nav.ts'
import { GitHubIcon } from '../../components/navigation/github-icon.tsx'
import { Link } from '../../components/navigation/link.tsx'
import { t } from '../../lib/i18n.ts'
import { getSectionIntro } from '../../lib/section-intros.ts'
import { routes } from '../../routes.ts'

/**
 * Landing page: large card links to each main section of the app.
 *
 * A signed-out visitor gets a prominent sign-in prompt above the section
 * cards — every section now requires GitHub sign-in (Phase 0 of
 * `docs/STORAGE_MIGRATION_PLAN.md`), and clicking a card without one just
 * bounces back here via `requireApprovedSession`, so this is where the
 * "why" has to land. A session pending allowlist approval is signed in and
 * skips this: it already gets a pending notice on each page it opens.
 */
export function IntroPage(
	handle: Handle<Record<string, never>, SessionContext>,
) {
	return () => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		return (
			<main class="mx-auto w-full min-w-0 max-w-4xl">
				<header class="mb-8">
					<h1 class="text-2xl font-bold tracking-tight text-foreground">
						{t('app.name')}
					</h1>
					<p class="mt-2 max-w-2xl text-sm text-muted-foreground">
						{t('intro.tagline')}
					</p>
				</header>
				{session === null ? (
					<div
						role="status"
						class="mb-8 flex flex-col items-start gap-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="max-w-2xl">
							<p class="text-sm font-medium text-card-foreground">
								{t('intro.signInPrompt.title')}
							</p>
							<p class="mt-1 text-sm text-muted-foreground">
								{t('intro.signInPrompt.body')}
							</p>
						</div>
						<Link
							href={routes.auth.login.href()}
							navigationLoading={true}
							class="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							labelClass="inline-flex items-center gap-2"
						>
							<GitHubIcon class="h-4 w-4 shrink-0" />
							{t('chrome.signInGithub')}
						</Link>
					</div>
				) : null}
				<ul class="grid list-none gap-4 p-0 sm:grid-cols-2">
					{getNavLinks()
						.filter((link) => link.placement === 'primary')
						.map((link) => {
							const intro = getSectionIntro(link.page)
							return (
								<li key={link.page}>
									<SectionIntroCard
										page={link.page}
										variant="home-link"
										href={link.href}
										title={intro.title}
										description={intro.description}
									/>
								</li>
							)
						})}
				</ul>
			</main>
		)
	}
}
