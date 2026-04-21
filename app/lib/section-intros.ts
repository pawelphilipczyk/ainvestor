import type { AppPage } from './app-page.ts'
import type { AppPage } from './app-page.ts'
import { t } from './i18n.ts'

export type SectionIntroPage = Exclude<AppPage, 'home'>

/** Title and lead line for each main section (home cards + page intros). */
export const SECTION_INTROS: Record<
	SectionIntroPage,
	{ title: string; description: string }
> = {
	portfolio: {
		title: t('section.portfolio.title'),
		description: t('section.portfolio.description'),
	},
	advice: {
		title: t('section.advice.title'),
		description: t('section.advice.description'),
	},
	catalog: {
		title: t('section.catalog.title'),
		description: t('section.catalog.description'),
	},
	guidelines: {
		title: t('section.guidelines.title'),
		description: t('section.guidelines.description'),
	},
	admin: {
		title: t('admin.etfImport.title'),
		description: t('admin.etfImport.description'),
	},
}
import { t } from './i18n.ts'

export type SectionIntroPage = Exclude<AppPage, 'home'>

/** Title and lead line for each main section (home cards + page intros). */
export const SECTION_INTROS: Record<
	SectionIntroPage,
	{ title: string; description: string }
> = {
	portfolio: {
		title: t('section.portfolio.title'),
		description: t('section.portfolio.description'),
	},
	advice: {
		title: t('section.advice.title'),
		description: t('section.advice.description'),
	},
	catalog: {
		title: t('section.catalog.title'),
		description: t('section.catalog.description'),
	},
	guidelines: {
		title: t('section.guidelines.title'),
		description: t('section.guidelines.description'),
	},
}
