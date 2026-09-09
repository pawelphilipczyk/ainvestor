import type { AppPage } from './app-page.ts'
import type { MessageKey } from './i18n.ts'
import { t } from './i18n.ts'

export type SectionIntroPage = Exclude<AppPage, 'home'>

const SECTION_INTRO_KEYS: Record<
	SectionIntroPage,
	{ titleKey: MessageKey; descriptionKey: MessageKey }
> = {
	portfolio: {
		titleKey: 'section.portfolio.title',
		descriptionKey: 'section.portfolio.description',
	},
	advice: {
		titleKey: 'section.advice.title',
		descriptionKey: 'section.advice.description',
	},
	catalog: {
		titleKey: 'section.catalog.title',
		descriptionKey: 'section.catalog.description',
	},
	guidelines: {
		titleKey: 'section.guidelines.title',
		descriptionKey: 'section.guidelines.description',
	},
	admin: {
		titleKey: 'admin.etfImport.title',
		descriptionKey: 'admin.etfImport.description',
	},
}

/** Title and lead for each main section (home cards + page intros). Resolves at render time. */
export function getSectionIntro(page: SectionIntroPage): {
	title: string
	description: string
} {
	const keys = SECTION_INTRO_KEYS[page]
	return {
		title: t(keys.titleKey),
		description: t(keys.descriptionKey),
	}
}
