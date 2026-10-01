/**
 * Commit messages for writes to a user's data repo.
 *
 * The repo's history is the only record of what changed and who changed it
 * (Phase 5 builds on it), so each write says what it did and which entry point
 * made it. Kept in one place so the web app and the MCP server cannot drift
 * into two formats. Not user-visible UI copy — it lives in the user's own
 * repo — so it is plain English, not an i18n key.
 */

/** The entry point that made a write. */
export type CommitSource = 'web' | 'MCP'

/** `Buy SWDA LN: +1 PLN (MCP)` — the summary plus where it came from. */
export function commitMessage(params: {
	summary: string
	source: CommitSource
}): string {
	return `${params.summary} (${params.source})`
}

/** The summary of one buy or sell: `Buy SWDA LN: +1 PLN`, `Sell SWDA LN: -1 PLN`. */
export function describePortfolioOperation(params: {
	portfolioOperation: 'buy' | 'sell'
	instrumentTicker: string
	value: number
	currency: string
}): string {
	const { portfolioOperation, instrumentTicker, value, currency } = params
	const verb = portfolioOperation === 'sell' ? 'Sell' : 'Buy'
	const sign = portfolioOperation === 'sell' ? '-' : '+'
	return `${verb} ${instrumentTicker.trim().toUpperCase()}: ${sign}${value} ${currency.toUpperCase()}`
}

/** What a guideline row is called in a summary: the fund, or the asset class. */
export function describeGuideline(guideline: {
	kind: 'asset_class' | 'instrument'
	etfName: string
	etfType: string
}): string {
	return guideline.kind === 'instrument'
		? guideline.etfName
		: `${guideline.etfType} class`
}

/** An advice mode as it reads in a summary: `buy_next` → `buy-next`. */
export function describeAdviceMode(mode: string): string {
	return mode.replaceAll('_', '-')
}
