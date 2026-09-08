/**
 * Buy/sell validation and mutation for one portfolio row, shared by the web
 * app's operation form (`app/features/portfolio/portfolio-operation-form/index.ts`)
 * and the MCP `record_operation` tool (`mcp/tools/portfolio.ts`) — see Stage 7
 * in docs/MCP_SERVER_PLAN.md. Kept free of JSX, sessions, and HTTP response
 * shaping — just `remix/data-schema` and the plain matching/mutation logic —
 * so the MCP server does not have to import the form's UI-rendering module to
 * reuse its validation.
 */
import { literal, object, parseSafe, string, variant } from 'remix/data-schema'
import { min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import type { CatalogEntry } from '../features/catalog/lib.ts'
import { findCatalogEntryByTicker } from '../features/catalog/lib.ts'
import type { EtfEntry } from './gist.ts'
import { t } from './i18n.ts'
import { parseLocaleDecimalString } from './locale-decimal-input.ts'

const portfolioOperationFields = {
	instrumentTicker: string().pipe(minLength(1)),
	value: coerce.number().pipe(min(0)),
	currency: string(),
}

export const PortfolioBuyOperationSchema = object({
	portfolioOperation: literal('buy' as const),
	...portfolioOperationFields,
})

export const PortfolioSellOperationSchema = object({
	portfolioOperation: literal('sell' as const),
	...portfolioOperationFields,
	value: coerce
		.number()
		.pipe(min(0))
		.refine((n) => n > 0, t('errors.portfolio.sellValueNotPositive')),
})

export const PortfolioOperationSchema = variant('portfolioOperation', {
	buy: PortfolioBuyOperationSchema,
	sell: PortfolioSellOperationSchema,
})

function normalizePortfolioOperationValue(raw: Record<string, unknown>): void {
	if (typeof raw.value === 'string') {
		const parsed = parseLocaleDecimalString(raw.value)
		raw.value = parsed === null ? raw.value : String(parsed)
	}
}

/** Normalizes portfolio operation payload (form fields or MCP tool arguments) before schema parse. */
export function normalizePortfolioOperationInput(
	raw: Record<string, unknown>,
): void {
	normalizePortfolioOperationValue(raw)
}

/** Result of {@link parseSafe} against {@link PortfolioOperationSchema}, exported so callers need not import `parseSafe` themselves. */
export function parsePortfolioOperationInput(raw: Record<string, unknown>) {
	normalizePortfolioOperationInput(raw)
	return parseSafe(PortfolioOperationSchema, raw)
}

export type PortfolioOperationKind = 'buy' | 'sell'

export type PortfolioOperationInput = {
	portfolioOperation: PortfolioOperationKind
	/** Catalog ticker naming the fund; resolved against the catalog for its canonical spelling and name. */
	instrumentTicker: string
	/** Already validated non-negative (buy) or positive (sell) by the caller. */
	value: number
	currency: string
}

/**
 * A row is matched by currency plus ticker when the row has one, else by name —
 * the same identity the web app's holdings list uses to tell two rows of the
 * same fund in different currencies apart.
 */
export function findExistingHoldingIndex(params: {
	current: EtfEntry[]
	normalizedCurrency: string
	normalizedTicker: string
	normalizedName: string
}): number {
	const { current, normalizedCurrency, normalizedTicker, normalizedName } =
		params
	return current.findIndex((entry) => {
		if (entry.currency.toUpperCase() !== normalizedCurrency) return false
		if (entry.ticker) {
			return entry.ticker.toUpperCase() === normalizedTicker
		}
		return entry.name.toLowerCase() === normalizedName
	})
}

export type PortfolioOperationBlocker =
	/** `instrumentTicker` is not in the shared catalog. */
	| 'catalog_entry_missing'
	/** Sell with no matching holding (same ticker/name and currency). */
	| 'sell_no_holding'
	/** Sell value exceeds the matching holding's value. */
	| 'sell_exceeds_holdings'

export type PortfolioOperationOutcome =
	| { applied: false; blocker: PortfolioOperationBlocker }
	| {
			applied: true
			action: 'created' | 'updated' | 'removed'
			/** The row as it stands after the operation (the removed row itself for `removed`). */
			entry: EtfEntry
			/** The full holdings array with the change applied. */
			holdings: EtfEntry[]
	  }

/**
 * Apply one buy or sell to `current`, matching the exact rules the web app's
 * operation form uses: buy creates a new row or adds to a matching one; sell
 * subtracts from a matching row and drops it once its value reaches zero.
 * Never sells a row below zero.
 */
export function applyPortfolioOperation(params: {
	current: EtfEntry[]
	catalog: CatalogEntry[]
	input: PortfolioOperationInput
}): PortfolioOperationOutcome {
	const { current, catalog, input } = params
	const match = findCatalogEntryByTicker(catalog, input.instrumentTicker)
	if (!match) return { applied: false, blocker: 'catalog_entry_missing' }

	const name = match.name
	const normalizedName = name.toLowerCase()
	const normalizedCurrency = input.currency.toUpperCase()
	const normalizedTicker = match.ticker.toUpperCase()
	const existingIndex = findExistingHoldingIndex({
		current,
		normalizedCurrency,
		normalizedTicker,
		normalizedName,
	})
	const existing = existingIndex >= 0 ? current[existingIndex] : null
	const ticker = match.ticker

	if (input.portfolioOperation === 'buy') {
		const entry: EtfEntry = existing
			? {
					...existing,
					ticker: existing.ticker ?? ticker,
					value: existing.value + input.value,
				}
			: {
					id: crypto.randomUUID(),
					name,
					ticker,
					value: input.value,
					currency: normalizedCurrency,
				}
		const holdings =
			existingIndex >= 0
				? current.map((e, i) => (i === existingIndex ? entry : e))
				: [entry, ...current]
		return {
			applied: true,
			action: existingIndex >= 0 ? 'updated' : 'created',
			entry,
			holdings,
		}
	}

	if (existingIndex < 0 || !existing) {
		return { applied: false, blocker: 'sell_no_holding' }
	}

	const nextValue = existing.value - input.value
	if (nextValue < 0) {
		return { applied: false, blocker: 'sell_exceeds_holdings' }
	}

	if (nextValue === 0) {
		const holdings = current.filter((_, i) => i !== existingIndex)
		return { applied: true, action: 'removed', entry: existing, holdings }
	}

	const updatedEntry: EtfEntry = {
		...existing,
		ticker: existing.ticker ?? ticker,
		value: nextValue,
	}
	const holdings = current.map((e, i) =>
		i === existingIndex ? updatedEntry : e,
	)
	return { applied: true, action: 'updated', entry: updatedEntry, holdings }
}
