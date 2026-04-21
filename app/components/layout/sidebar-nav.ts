import { t } from '../../lib/i18n.ts'
import { t } from '../../lib/i18n.ts'
import type { SectionIntroPage } from '../../lib/section-intros.ts'
import { routes } from '../../routes.ts'

export type NavLink = {
	href: string
	label: string
	page: SectionIntroPage
}

/** Build nav links at render time so labels follow the active locale (not module load). */
export function getNavLinks(): NavLink[] {
	return [
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
		{
			href: routes.adminEtfImport.href(),
			label: t('nav.admin'),
			page: 'admin',
		},
	]
}
import type { SectionIntroPage } from '../../lib/section-intros.ts'
import { routes } from '../../routes.ts'

export type NavLink = {
	href: string
	label: string
	page: SectionIntroPage
}

/** Build nav links at render time so labels follow the active locale (not module load). */
export function getNavLinks(): NavLink[] {
	return [
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
}
