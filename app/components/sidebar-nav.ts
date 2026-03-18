import { routes } from '../routes.ts'

export type NavPage = 'portfolio' | 'guidelines' | 'catalog'

export type NavLink = {
	href: string
	label: string
	page: NavPage
}

export const NAV_LINKS: NavLink[] = [
	{
		href: routes.portfolio.index.href(),
		label: 'Portfolio',
		page: 'portfolio',
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
