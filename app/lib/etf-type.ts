/** Persisted ETF asset-class keys (catalog + guidelines JSON). */

export type EtfType =
	| 'equity'
	| 'bond'
	| 'real_estate'
	| 'commodity'
	| 'mixed'
	| 'money_market'

export const ETF_TYPES = [
	'equity',
	'bond',
	'real_estate',
	'commodity',
	'mixed',
	'money_market',
] as const satisfies readonly EtfType[]
