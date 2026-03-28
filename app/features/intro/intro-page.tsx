import type { Handle } from 'remix/component'
import { Card } from '../../components/index.ts'
import { NAV_LINKS } from '../../components/sidebar-nav.ts'
import type { AppPage } from '../../lib/app-page.ts'
import { t } from '../../lib/i18n.ts'

const blurbs: Partial<Record<AppPage, string>> = {
	portfolio: t('intro.blurb.portfolio'),
	advice: t('intro.blurb.advice'),
	catalog: t('intro.blurb.catalog'),
	guidelines: t('intro.blurb.guidelines'),
}

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
				{NAV_LINKS.map((link) => {
					const description = blurbs[link.page]
					if (!description) return null
					return (
						<li key={link.page}>
							<a
								href={link.href}
								class="group block rounded-xl no-underline outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							>
								<Card class="flex h-full min-h-[7.5rem] flex-col justify-center p-6 transition-colors group-hover:border-ring/60 group-hover:bg-accent/5">
									<h2 class="text-lg font-semibold tracking-tight text-card-foreground">
										{link.label}
									</h2>
									<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
										{description}
									</p>
								</Card>
							</a>
						</li>
					)
				})}
			</ul>
		</main>
	)
}
