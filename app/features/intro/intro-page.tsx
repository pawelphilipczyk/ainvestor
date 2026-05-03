import type { Handle } from 'remix/component'
import { SectionIntroCard } from '../../components/data-display/section-intro-card.tsx'
import { getNavLinks } from '../../components/layout/sidebar-nav.ts'
import { t } from '../../lib/i18n.ts'
import { getSectionIntro } from '../../lib/section-intros.ts'

/**
 * Landing page: large card links to each main section of the app.
 */
export function IntroPage(_handle: Handle, _setup?: unknown) {
	return () => (
		<main class="mx-auto w-full min-w-0 max-w-4xl">
			<header class="mb-8">
				<h1 class="text-2xl font-bold tracking-tight text-foreground">
					{t('app.name')}
				</h1>
				<p class="mt-2 max-w-2xl text-sm text-muted-foreground">
					{t('intro.tagline')}
				</p>
			</header>
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
