/**
 * Supported portfolio / advice currencies (same list as the add ETF form).
 * PLN is the default and appears first in dropdowns.
 */
export const CURRENCIES = [
	'PLN',
	'USD',
	'EUR',
	'GBP',
	'CHF',
	'JPY',
	'CAD',
	'AUD',
	'SEK',
	'NOK',
] as const

export type Currency = (typeof CURRENCIES)[number]
