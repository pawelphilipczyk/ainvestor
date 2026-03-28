import type { AppPage } from '../lib/app-page.ts'
import { t } from '../lib/i18n.ts'
import { routes } from '../routes.ts'

export type NavLink = {
	href: string
	label: string
	page: AppPage
}

export const NAV_LINKS: NavLink[] = [
	{
		href: routes.portfolio.index.href(),
		label: t('nav.portfolio'),
		page: 'portfolio',
	},
	{
		href: routes.advice.index.href(),
		label: t('nav.advice'),
		page: 'advice',
	},
	{
		href: routes.catalog.index.href(),
		label: t('nav.catalog'),
		page: 'catalog',
	},
	{
		href: routes.guidelines.index.href(),
		label: t('nav.guidelines'),
		page: 'guidelines',
	},
]
