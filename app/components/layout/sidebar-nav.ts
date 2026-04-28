import { t } from '../../lib/i18n.ts'
import type { SectionIntroPage } from '../../lib/section-intros.ts'
import { routes } from '../../routes.ts'

export type NavLink = {
	href: string
	label: string
	page: SectionIntroPage
	placement: 'primary' | 'secondary'
}

/** Build nav links at render time so labels follow the active locale (not module load). */
export function getNavLinks(): NavLink[] {
	return [
		{
			href: routes.portfolio.index.href(),
			label: t('nav.portfolio'),
			page: 'portfolio',
			placement: 'primary',
		},
		{
			href: routes.advice.index.href(),
			label: t('nav.advice'),
			page: 'advice',
			placement: 'primary',
		},
		{
			href: routes.catalog.index.href(),
			label: t('nav.catalog'),
			page: 'catalog',
			placement: 'primary',
		},
		{
			href: routes.guidelines.index.href(),
			label: t('nav.guidelines'),
			page: 'guidelines',
			placement: 'primary',
		},
		{
			href: routes.admin.etfImport.href(),
			label: t('nav.admin'),
			page: 'admin',
			placement: 'secondary',
		},
	]
}
