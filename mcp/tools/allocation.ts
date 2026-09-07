import type {
	AdviceBucketDiagnostic,
	AdviceCashDeploymentRow,
	AllocationDiagnosticsBlocker,
	BlockedAllocationDiagnostics,
} from '../../app/features/advice/advice-openai.ts'
import {
	computeAdviceAllocationDiagnosticsOutcome,
	parseAdviceCashAmount,
	planAdviceCashDeployment,
} from '../../app/features/advice/advice-openai.ts'
import type { CatalogEntry } from '../../app/features/catalog/lib.ts'
import { CURRENCIES } from '../../app/lib/currencies.ts'
import type { EtfEntry } from '../../app/lib/gist.ts'
import { fetchPortfolioSnapshot } from '../../app/lib/gist.ts'
import type { EtfGuideline, EtfType } from '../../app/lib/guidelines.ts'
import { fetchGuidelinesOrThrow } from '../../app/lib/guidelines.ts'
import type { GistCredentials } from '../data-gist.ts'
import { resolveDataGistId } from '../data-gist.ts'
import type { McpToolDefinition, McpToolResult } from '../protocol.ts'
import { summarizePortfolio } from './portfolio.ts'
import { roundToTwoDecimals } from './rounding.ts'
import { readStringArgument } from './tool-arguments.ts'
import { jsonResult } from './tool-result.ts'

/** The app's own default, used only when nothing better can be inferred. */
const DEFAULT_CASH_CURRENCY = CURRENCIES[0]

const DESCRIPTION = `Work out where a given amount of cash should go: for each asset class with a target, its current value, the value the target implies once the cash is invested, and the minimum purchase that closes the gap.

This is **buy-only** by design — it assumes nothing is sold, so a bucket already above target simply stays there and receives nothing. Never present its output as a reason to sell.

Targets come from the guidelines, folded per asset class (a named-fund row counts toward its own class). When they do not sum to 100% they are scaled to it, and both the raw and the normalized percentage are reported.

The maths needs one currency: the app performs no FX conversion, so holdings in several currencies, or cash in a currency the holdings are not in, yield no numbers at all rather than a guess. In that case the answer says so and why.`

/**
 * The reason there are no numbers, phrased for the model that asked.
 *
 * The compute function collapses every cause into one null; this is the
 * distinction, so the answer says which of them happened and what fixes it
 * instead of leaving the model to invent a total.
 */
function explainBlocker(params: {
	outcome: BlockedAllocationDiagnostics
	cashCurrency: string
	cashAmountText: string
	catalogSize: number
}): string {
	const { outcome, cashCurrency, cashAmountText, catalogSize } = params
	switch (outcome.blocker) {
		case 'unparseable_cash':
			return `"${cashAmountText}" is not a non-negative amount of cash, so there is nothing to allocate.`
		case 'mixed_holding_currencies':
			return 'The holdings span several currencies and the app applies no FX conversion, so they have no single total to measure targets against. Put the holdings in one currency in the web app first; get_portfolio lists which is which.'
		case 'cash_currency_mismatch':
			return `The cash is in ${cashCurrency} but every holding is in ${outcome.holdingsCurrency}, and the app applies no FX conversion, so the two cannot be added into one portfolio total. Pass cashCurrency "${outcome.holdingsCurrency}" if that is the money being deployed.`
		case 'no_guidelines':
			return 'No guidelines are set, so there is no target allocation to compare the portfolio against. Add targets with set_guideline first.'
		case 'no_positive_targets':
			return 'Every guideline target is 0%, so no asset class is being aimed at. Raise at least one with set_guideline.'
		case 'unclassified_holding': {
			const holding = outcome.unclassifiedHolding
			if (holding === undefined) {
				return 'A holding falls outside every asset class that has a target, so the buckets would not account for the whole portfolio.'
			}
			if (holding.etfType === 'mixed') {
				// `mixed` arrives here two ways — the catalog really classifies the
				// fund as mixed, or nothing matched it at all and this is the
				// fallback — and from outside the resolver the two are
				// indistinguishable, so claim neither. An empty catalog is worth
				// calling out separately: `fetchCatalog` reports an unconfigured id,
				// a rejected read and a timeout all as no rows, so "not listed" would
				// be a false statement about shared data during an outage.
				if (catalogSize === 0) {
					return `Holding "${holding.name}" could not be placed in an asset class, and the shared catalog came back with no entries at all — it is either not configured or temporarily unreachable, so nothing could be classified from it. Retry before changing any data; list_catalog shows whether the catalog is readable.`
				}
				return `Holding "${holding.name}" resolves to the "mixed" class, which this tool cannot allocate against — either the catalog classifies it that way, or nothing in the catalog and no instrument guideline matched it. Give it a concrete asset class: check get_catalog_entry for its ticker, correct the row with upsert_catalog_entry, or set an instrument guideline naming the ticker.`
			}
			return `Holding "${holding.name}" is ${holding.etfType}, but no guideline targets that asset class, so the buckets would not account for the whole portfolio. Add a ${holding.etfType} target with set_guideline.`
		}
	}
}

export type AllocationBucket = {
	etfType: EtfType
	/** Sum of the guideline rows of this type, as written. */
	targetPct: number
	/** The same target as a share of all targets — what the amounts below use. */
	normalizedTargetPct: number
	currentValue: number
	targetValueAfterInvesting: number
	/** What it takes to reach the target without selling; 0 when already there. */
	minimumBuy: number
	/** This bucket's slice of the cash actually being deployed. */
	deployCash: number
}

type CashSummary = {
	amount: number
	currency: string
	currencySource: 'argument' | 'holdings' | 'default'
}

/**
 * Deliberately a discriminated union: a blocked answer carries no buckets at
 * all, so a caller cannot read zeroes out of one and present them as gaps.
 */
export type AllocationDiagnosticsSummary =
	| {
			available: false
			blocker: AllocationDiagnosticsBlocker
			reason: string
			cash: CashSummary
			holdingCount: number
			guidelineCount: number
	  }
	| {
			available: true
			buyOnly: true
			cash: CashSummary
			portfolioValue: number
			postInvestmentTotal: number
			targetPctSum: number
			buckets: AllocationBucket[]
			minimumBuysTotal: number
			cashCoversAllMinimumBuys: boolean
			/**
			 * Omitted in the ordinary case, where it is exactly zero: the minimum
			 * buys sum to the cash whenever no bucket is overweight, and an
			 * overweight one takes the sum above it. See `planAdviceCashDeployment`.
			 */
			cashLeftAfterMinimumBuys?: number
			note: string
	  }

function bucketRow(params: {
	diagnostic: AdviceBucketDiagnostic
	deployment: AdviceCashDeploymentRow | undefined
	targetPctSum: number
}): AllocationBucket {
	const { diagnostic, deployment, targetPctSum } = params
	return {
		etfType: diagnostic.etfType,
		targetPct: roundToTwoDecimals(diagnostic.targetPct),
		normalizedTargetPct: roundToTwoDecimals(
			(diagnostic.targetPct / targetPctSum) * 100,
		),
		currentValue: roundToTwoDecimals(diagnostic.currentAmt),
		targetValueAfterInvesting: roundToTwoDecimals(diagnostic.targetAmtPost),
		minimumBuy: roundToTwoDecimals(diagnostic.idealBuyMin),
		deployCash: roundToTwoDecimals(deployment?.amount ?? 0),
	}
}

/**
 * The whole answer, computed without I/O so tests can drive it directly.
 *
 * `cashCurrency` is resolved by the caller rather than defaulted here: it
 * depends on the holdings, and the response reports where it came from.
 */
export function summarizeAllocationDiagnostics(params: {
	holdings: EtfEntry[]
	guidelines: EtfGuideline[]
	catalog: CatalogEntry[]
	cashAmountText: string
	cashCurrency: string
	cashCurrencySource: 'argument' | 'holdings' | 'default'
}): AllocationDiagnosticsSummary {
	const {
		holdings,
		guidelines,
		catalog,
		cashAmountText,
		cashCurrency,
		cashCurrencySource,
	} = params

	const outcome = computeAdviceAllocationDiagnosticsOutcome({
		holdings,
		guidelines,
		catalog,
		cashAmount: cashAmountText,
		cashCurrency,
	})

	// The diagnostics were computed from the unrounded parse, so the deployment
	// must be too: planning against the rounded figure leaves the difference
	// behind as a remainder, and half a grosz would then be reported as real
	// spare cash by the very field that exists to flag leftovers.
	const cashAmount = parseAdviceCashAmount(cashAmountText) ?? 0
	const cash = {
		amount: roundToTwoDecimals(cashAmount),
		currency: cashCurrency,
		currencySource: cashCurrencySource,
	}

	if (outcome.blocker !== null) {
		return {
			available: false,
			blocker: outcome.blocker,
			reason: explainBlocker({
				outcome,
				cashCurrency,
				cashAmountText,
				catalogSize: catalog.length,
			}),
			cash,
			holdingCount: holdings.length,
			guidelineCount: guidelines.length,
		}
	}

	const { diagnostics } = outcome
	const deployment = planAdviceCashDeployment({ diagnostics, cashAmount })
	const deploymentByType = new Map(
		deployment.rows.map((row) => [row.etfType, row]),
	)

	return {
		available: true,
		buyOnly: true,
		cash,
		portfolioValue: roundToTwoDecimals(diagnostics.postTotal - cashAmount),
		postInvestmentTotal: roundToTwoDecimals(diagnostics.postTotal),
		targetPctSum: roundToTwoDecimals(diagnostics.targetPctSum),
		buckets: diagnostics.rows.map((diagnostic) =>
			bucketRow({
				diagnostic,
				deployment: deploymentByType.get(diagnostic.etfType),
				targetPctSum: diagnostics.targetPctSum,
			}),
		),
		minimumBuysTotal: roundToTwoDecimals(diagnostics.sumIdealBuyMin),
		cashCoversAllMinimumBuys: deployment.coversAllMinimumBuys,
		...(roundToTwoDecimals(deployment.remainder) === 0
			? {}
			: {
					cashLeftAfterMinimumBuys: roundToTwoDecimals(deployment.remainder),
				}),
		note: deployment.coversAllMinimumBuys
			? 'The cash covers every minimum buy, so deployCash takes each bucket to its target. Buy-only: a bucket already at or above target gets nothing.'
			: 'The cash does not cover every minimum buy, so deployCash splits it in proportion to those minimums and no bucket quite reaches its target. Buy-only: nothing is sold to close the gap.',
	}
}

/** Models routinely send a number where the schema says string; take either. */
function readCashAmountText(toolArguments: Record<string, unknown>): string {
	const raw = toolArguments.cashAmount
	const text =
		typeof raw === 'number'
			? String(raw)
			: readStringArgument(toolArguments, 'cashAmount')
	if (text === null) {
		throw new Error(
			'"cashAmount" is required: the cash to deploy, for example "5000".',
		)
	}
	if (parseAdviceCashAmount(text) === null) {
		throw new Error(
			`"cashAmount" must be a non-negative number; got "${text}". Both "1234.5" and "1 234,5" are accepted.`,
		)
	}
	return text
}

/**
 * The argument wins when given, then the currency the holdings already share —
 * which spares the caller the mismatch refusal in the common case — and only
 * an empty portfolio falls back to the app's own default.
 */
function resolveCashCurrency(params: {
	toolArguments: Record<string, unknown>
	holdingsCurrency: string | null
}): {
	cashCurrency: string
	cashCurrencySource: 'argument' | 'holdings' | 'default'
} {
	const requested = readStringArgument(params.toolArguments, 'cashCurrency')
	if (requested !== null) {
		const normalized = requested.toUpperCase()
		if (!(CURRENCIES as readonly string[]).includes(normalized)) {
			throw new Error(
				`"cashCurrency" must be one of: ${CURRENCIES.join(', ')}; got "${requested}".`,
			)
		}
		return { cashCurrency: normalized, cashCurrencySource: 'argument' }
	}
	if (params.holdingsCurrency !== null) {
		return {
			cashCurrency: params.holdingsCurrency,
			cashCurrencySource: 'holdings',
		}
	}
	return { cashCurrency: DEFAULT_CASH_CURRENCY, cashCurrencySource: 'default' }
}

export function createGetAllocationDiagnosticsTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const cashAmountText = readCashAmountText(toolArguments)
		const gistId = await resolveDataGistId(credentials)
		const [{ entries, catalog }, guidelines] = await Promise.all([
			fetchPortfolioSnapshot(credentials.githubToken, gistId),
			fetchGuidelinesOrThrow(credentials.githubToken, gistId),
		])

		// summarizePortfolio already separates "one currency" from "mixed" and
		// "empty"; its `currency` is non-null only in the first case.
		const { currency: holdingsCurrency } = summarizePortfolio(entries)
		const { cashCurrency, cashCurrencySource } = resolveCashCurrency({
			toolArguments,
			holdingsCurrency,
		})

		return jsonResult(
			summarizeAllocationDiagnostics({
				holdings: entries,
				guidelines,
				catalog,
				cashAmountText,
				cashCurrency,
				cashCurrencySource,
			}),
		)
	}

	return {
		name: 'get_allocation_diagnostics',
		title: 'Get allocation diagnostics',
		description: DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				cashAmount: {
					type: 'string',
					description:
						'Cash to deploy, as a non-negative number. "1234.5" and "1 234,5" both work.',
				},
				cashCurrency: {
					type: 'string',
					enum: [...CURRENCIES],
					description:
						'Currency of that cash. Defaults to the currency the holdings are in, or PLN when the portfolio is empty; the answer reports which was used.',
				},
			},
			required: ['cashAmount'],
		},
		handler,
	}
}
