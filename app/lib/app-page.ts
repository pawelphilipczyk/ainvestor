/** Single source of truth for app shell / sidebar page ids. */
export const AppPages = [
	'home',
	'portfolio',
	'advice',
	'guidelines',
	'catalog',
	'admin',
] as const

export type AppPage = (typeof AppPages)[number]
