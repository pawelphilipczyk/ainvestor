import type { AppPage } from './app-page.ts'

export type SectionIntroPage = Exclude<AppPage, 'home'>

/** Title and lead line for each main section (home cards + page intros). */
export const SECTION_INTROS: Record<
	SectionIntroPage,
	{ title: string; description: string }
> = {
	portfolio: {
		title: 'Portfolio',
		description:
			'Paste or upload a broker CSV to add what you already hold or want to buy.',
	},
	advice: {
		title: 'Get Advice',
		description:
			'Tell me how much cash you have and I’ll suggest what to buy next.',
	},
	catalog: {
		title: 'ETF Catalog',
		description: 'Import your broker’s ETF list and browse what’s available.',
	},
	guidelines: {
		title: 'Investment Guidelines',
		description: 'Set your target allocation.',
	},
}
