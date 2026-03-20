/** Single source of truth for app shell / sidebar page ids. */
export const AppPages = [
	'portfolio',
	'advice',
	'guidelines',
	'catalog',
] as const

export type AppPage = (typeof AppPages)[number]
