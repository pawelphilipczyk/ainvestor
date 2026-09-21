/** Persisted ETF asset-class keys (catalog + guidelines JSON). */

export type EtfType =
	| 'equity'
	| 'bond'
	| 'real_estate'
	| 'commodity'
	| 'mixed'
	| 'money_market'
	| 'unknown'

export const ETF_TYPES = [
	'equity',
	'bond',
	'real_estate',
	'commodity',
	'mixed',
	'money_market',
	'unknown',
] as const satisfies readonly EtfType[]

/**
 * Types a guideline may target. `unknown` marks a catalog row the import could
 * not classify — it is a to-do for the catalog, never an asset class to aim at.
 */
export const GUIDELINE_ETF_TYPES = ETF_TYPES.filter(
	(etfType) => etfType !== 'unknown',
)
