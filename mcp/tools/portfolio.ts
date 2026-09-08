import { fetchCatalog } from '../../app/features/catalog/lib.ts'
import { CURRENCIES } from '../../app/lib/currencies.ts'
import { type EtfEntry, fetchEtfs, saveEtfs } from '../../app/lib/gist.ts'
import { totalHoldingsValueForShareBars } from '../../app/lib/portfolio-holdings-share.ts'
import type { PortfolioOperationBlocker } from '../../app/lib/portfolio-operations.ts'
import {
	applyPortfolioOperation,
	parsePortfolioOperationInput,
} from '../../app/lib/portfolio-operations.ts'
import type { GistCredentials } from '../data-gist.ts'
import { resolveDataGistId } from '../data-gist.ts'
import { fetchEtfsCached, invalidateEtfsCache } from '../private-gist-cache.ts'
import type { McpToolDefinition, McpToolResult } from '../protocol.ts'
import { roundToTwoDecimals } from './rounding.ts'
import { readStringArgument } from './tool-arguments.ts'
import { jsonResult } from './tool-result.ts'

const DESCRIPTION = `Read the user's current ETF portfolio: every holding with its value and currency, plus the portfolio total and each holding's share of it.

Values are monetary amounts, not unit counts — the portfolio stores no quantities, prices, or dates, so this cannot answer questions about returns, performance over time, or when something was bought. When holdings span several currencies no total is reported, because the app performs no FX conversion.`

const RECORD_OPERATION_DESCRIPTION = `Buy or sell one holding, by its catalog ticker. This is the same operation the web app's portfolio form performs — a buy adds to a matching row or creates a new one, a sell subtracts from a matching row and removes it once its value reaches zero.

A row is matched by ticker (or name, for a legacy row with no ticker) **and** currency together: a buy or sell in a currency the holding is not in creates or targets a separate row rather than converting anything, because the app applies no FX conversion. get_portfolio lists each holding's currency.

The ticker must be in the shared catalog (list_catalog / get_catalog_entry); this tool does not accept an arbitrary name. A sell greater than the matching holding's value is refused rather than going negative.

Read, change, and save happen inside this one call. The gist API offers no conditional write, so an edit made elsewhere in between is overwritten rather than merged — the gist keeps it in its revision history, so tell the user to restore it there if that happens.`

const REMOVE_HOLDING_DESCRIPTION = `Delete one holding by its id, as reported by get_portfolio — regardless of its value. Unlike record_operation's sell, this does not require knowing the exact value to zero it out, so it is the right tool for removing a holding entered by mistake.

Read and save happen inside this one call. The gist API offers no conditional write, so an edit made elsewhere in between is overwritten rather than merged — the gist keeps it in its revision history, so tell the user to restore it there if that happens.`

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
		const entries = await fetchEtfsCached(credentials.githubToken, gistId)
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

/** A flat row for one holding — record_operation/remove_holding report the whole portfolio via summarizePortfolio, so this carries no share. */
function entrySummary(entry: EtfEntry) {
	return {
		id: entry.id,
		name: entry.name,
		...(entry.ticker === undefined ? {} : { ticker: entry.ticker }),
		value: entry.value,
		currency: entry.currency,
	}
}

/** The reason a buy/sell was refused, phrased for the model that asked. */
function explainOperationBlocker(params: {
	blocker: PortfolioOperationBlocker
	instrumentTicker: string
}): string {
	const { blocker, instrumentTicker } = params
	switch (blocker) {
		case 'catalog_entry_missing':
			return `"${instrumentTicker}" is not in the shared catalog, so it cannot be bought or sold. Use list_catalog to find the right ticker.`
		case 'sell_no_holding':
			return `No holding matches "${instrumentTicker}" in that currency, so there is nothing to sell. Call get_portfolio to see the current holdings and their currencies.`
		case 'sell_exceeds_holdings':
			return "The sell value is more than the matching holding's value. Call get_portfolio for its current value."
	}
}

export function createRecordOperationTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const raw: Record<string, unknown> = { ...toolArguments }
		const parsed = parsePortfolioOperationInput(raw)
		if (!parsed.success) {
			const detail = parsed.issues.map((issue) => issue.message).join('; ')
			throw new Error(
				`Invalid operation: ${
					detail.length > 0
						? detail
						: 'check "portfolioOperation" ("buy" or "sell"), "instrumentTicker", "value" and "currency".'
				}`,
			)
		}
		const operation = parsed.value
		const currency = operation.currency.toUpperCase()
		if (!(CURRENCIES as readonly string[]).includes(currency)) {
			throw new Error(
				`"currency" must be one of: ${CURRENCIES.join(', ')}; got "${operation.currency}".`,
			)
		}

		const gistId = await resolveDataGistId(credentials)
		// Uncached, like set_guideline/delete_guideline: this read feeds a
		// same-call overwrite of the whole file, so a cached copy up to the TTL
		// old would let a concurrent edit made elsewhere be silently discarded
		// rather than merely raced against, the way an uncached read already is.
		const [current, catalog] = await Promise.all([
			fetchEtfs(credentials.githubToken, gistId),
			fetchCatalog(),
		])

		const outcome = applyPortfolioOperation({
			current,
			catalog,
			input: {
				portfolioOperation: operation.portfolioOperation,
				instrumentTicker: operation.instrumentTicker,
				value: operation.value,
				currency,
			},
		})

		if (!outcome.applied) {
			throw new Error(
				explainOperationBlocker({
					blocker: outcome.blocker,
					instrumentTicker: operation.instrumentTicker,
				}),
			)
		}

		await saveEtfs(credentials.githubToken, gistId, outcome.holdings)
		invalidateEtfsCache(credentials.githubToken, gistId)

		return jsonResult({
			action: outcome.action,
			entry: entrySummary(outcome.entry),
			...summarizePortfolio(outcome.holdings),
		})
	}

	return {
		name: 'record_operation',
		title: 'Buy or sell a holding',
		description: RECORD_OPERATION_DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				portfolioOperation: {
					type: 'string',
					enum: ['buy', 'sell'],
					description: '"buy" adds to the holding; "sell" subtracts from it.',
				},
				instrumentTicker: {
					type: 'string',
					description: 'Catalog ticker of the fund.',
				},
				value: {
					type: 'string',
					description:
						'Amount of money to buy or sell, as a non-negative number. "1234.5" and "1 234,5" both work. A sell must be greater than zero.',
				},
				currency: {
					type: 'string',
					enum: [...CURRENCIES],
					description:
						"Currency of that amount. Must match the target holding's currency exactly — the app applies no FX conversion.",
				},
			},
			required: ['portfolioOperation', 'instrumentTicker', 'value', 'currency'],
		},
		handler,
	}
}

export function createRemoveHoldingTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const id = readStringArgument(toolArguments, 'id')
		if (id === null) {
			throw new Error('"id" is required; get_portfolio reports the ids.')
		}

		const gistId = await resolveDataGistId(credentials)
		// Uncached — see the same note in record_operation.
		const current = await fetchEtfs(credentials.githubToken, gistId)
		const existing = current.find((entry) => entry.id === id)
		if (existing === undefined) {
			throw new Error(
				`No holding has id "${id}". Call get_portfolio for the current ids.`,
			)
		}

		const next = current.filter((entry) => entry.id !== id)
		await saveEtfs(credentials.githubToken, gistId, next)
		invalidateEtfsCache(credentials.githubToken, gistId)

		return jsonResult({
			action: 'removed',
			removed: entrySummary(existing),
			...summarizePortfolio(next),
		})
	}

	return {
		name: 'remove_holding',
		title: 'Remove holding',
		description: REMOVE_HOLDING_DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					description: 'Holding id, as reported by get_portfolio.',
				},
			},
			required: ['id'],
		},
		handler,
	}
}
