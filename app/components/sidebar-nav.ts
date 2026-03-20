import type { AppPage } from '../lib/app-page.ts'
import { routes } from '../routes.ts'

export type NavLink = {
	href: string
	label: string
	page: AppPage
}

export const NAV_LINKS: NavLink[] = [
	{
		href: routes.portfolio.index.href(),
		label: 'Portfolio',
		page: 'portfolio',
	},
	{
		href: routes.advice.index.href(),
		label: 'Get Advice',
		page: 'advice',
	},
	{
		href: routes.catalog.index.href(),
		label: 'ETF Catalog',
		page: 'catalog',
	},
	{
		href: routes.guidelines.index.href(),
		label: 'Investment Guidelines',
		page: 'guidelines',
	},
]
