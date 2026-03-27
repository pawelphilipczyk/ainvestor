import type { Handle } from 'remix/component'
import { SectionIntroCard } from '../../components/section-intro-card.tsx'
import { NAV_LINKS } from '../../components/sidebar-nav.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'

/**
 * Landing page: large card links to each main section of the app.
 */
export function IntroPage(_handle: Handle, _setup?: unknown) {
	return () => (
		<main class="mx-auto w-full min-w-0 max-w-4xl">
			<header class="mb-8">
				<h1 class="text-2xl font-bold tracking-tight text-foreground">
					AI Investor
				</h1>
				<p class="mt-2 max-w-2xl text-sm text-muted-foreground">
					Choose where to go next. Everything works in the browser; sign in with
					GitHub when you want your portfolio and catalog saved across sessions.
				</p>
			</header>
			<ul class="grid list-none gap-4 p-0 sm:grid-cols-2">
				{NAV_LINKS.map((link) => {
					const intro = SECTION_INTROS[link.page]
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
