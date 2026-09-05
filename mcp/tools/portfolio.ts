import type { EtfEntry } from '../../app/lib/gist.ts'
import { fetchEtfs } from '../../app/lib/gist.ts'
import { totalHoldingsValueForShareBars } from '../../app/lib/portfolio-holdings-share.ts'
import type { GistCredentials } from '../data-gist.ts'
import { resolveDataGistId } from '../data-gist.ts'
import type { McpToolDefinition, McpToolResult } from '../protocol.ts'

const DESCRIPTION = `Read the user's current ETF portfolio: every holding with its value and currency, plus the portfolio total and each holding's share of it.

Values are monetary amounts, not unit counts — the portfolio stores no quantities, prices, or dates, so this cannot answer questions about returns, performance over time, or when something was bought. When holdings span several currencies no total is reported, because the app performs no FX conversion.`

function roundToTwoDecimals(value: number): number {
	return Math.round(value * 100) / 100
}

/**
 * Share of the portfolio total.
 *
 * Deliberately not `valueShareOfHoldingsTotalPercent`: that helper ends in a
 * 0–100 clamp meant for bar widths, which would report a negative holding as 0%
 * and silently contradict the total the same response reports.
 */
function sharePercent(params: { value: number; total: number }): number | null {
	const { value, total } = params
	if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) {
		return null
	}
	return roundToTwoDecimals((100 * value) / total)
}

/** Shares are only meaningful against a single-currency total. */
function holdingRow(entry: EtfEntry, total: number | null) {
	const share =
		total === null ? null : sharePercent({ value: entry.value, total })
	return {
		id: entry.id,
		name: entry.name,
		...(entry.ticker === undefined ? {} : { ticker: entry.ticker }),
		...(entry.exchange === undefined ? {} : { exchange: entry.exchange }),
		value: entry.value,
		currency: entry.currency,
		...(share === null ? {} : { sharePct: share }),
	}
}

/**
 * `totalHoldingsValueForShareBars` returns null for an empty portfolio *and* for
 * mixed currencies. Separate them so the tool reports the real reason.
 */
export function summarizePortfolio(entries: EtfEntry[]) {
	if (entries.length === 0) {
		return {
			holdingCount: 0,
			totalValue: null,
			currency: null,
			mixedCurrencies: false,
			note: 'The portfolio is empty.',
			holdings: [],
		}
	}

	const total = totalHoldingsValueForShareBars(entries)
	if (total === null) {
		return {
			holdingCount: entries.length,
			totalValue: null,
			currency: null,
			mixedCurrencies: true,
			note: 'Holdings span multiple currencies; the app applies no FX conversion, so no combined total or share is available.',
			holdings: entries.map((entry) => holdingRow(entry, null)),
		}
	}

	// The total helper counts a non-finite value as zero. Say so rather than
	// letting a row sit in the list while contributing nothing to the total.
	const nonFiniteCount = entries.filter(
		(entry) => !Number.isFinite(entry.value),
	).length

	return {
		holdingCount: entries.length,
		totalValue: roundToTwoDecimals(total),
		currency: entries[0].currency,
		mixedCurrencies: false,
		...(nonFiniteCount === 0
			? {}
			: {
					note: `${nonFiniteCount} holding(s) have a non-numeric value; they are excluded from the total and have no share.`,
				}),
		holdings: entries.map((entry) => holdingRow(entry, total)),
	}
}

export function createGetPortfolioTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(): Promise<McpToolResult> {
		const gistId = await resolveDataGistId(credentials)
		const entries = await fetchEtfs(credentials.githubToken, gistId)
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(summarizePortfolio(entries), null, 2),
				},
			],
		}
	}

	return {
		name: 'get_portfolio',
		title: 'Get portfolio',
		description: DESCRIPTION,
		inputSchema: { type: 'object', properties: {} },
		handler,
	}
}
