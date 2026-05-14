import type { CatalogEntry } from '../features/catalog/lib.ts'
import {
	findCatalogEntryByTicker,
	riskBandFromRiskKid,
} from '../features/catalog/lib.ts'
import { ETF_TYPE_LABELS } from '../locales/en.ts'
import type { EtfEntry } from './gist.ts'
import type { EtfGuideline, EtfType } from './guidelines.ts'
import { sumGuidelineTargetPercent } from './guidelines.ts'
import {
	totalHoldingsValueForShareBars,
	valueShareOfHoldingsTotalPercent,
} from './portfolio-holdings-share.ts'

function englishEtfTypeLabel(etfType: EtfType): string {
	const label = ETF_TYPE_LABELS[etfType]
	return typeof label === 'string' && label.length > 0 ? label : String(etfType)
}

function catalogEntryForPortfolioRow(
	entry: EtfEntry,
	catalog: CatalogEntry[],
): CatalogEntry | undefined {
	if (entry.ticker) {
		const byTicker = findCatalogEntryByTicker(catalog, entry.ticker)
		if (byTicker) return byTicker
	}
	const normalizedName = entry.name.toLowerCase()
	return catalog.find((row) => row.name.toLowerCase() === normalizedName)
}

function formatDecimalEn(value: number, fractionDigits: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(value)
}

function pushOptionalCatalogField(
	lines: string[],
	key: string,
	value: string | number | boolean | undefined,
): void {
	if (value === undefined) return
	if (typeof value === 'string' && value.trim().length === 0) return
	lines.push(`- ${key}: ${typeof value === 'string' ? value : String(value)}`)
}

function catalogEntryMarkdownLines(entry: CatalogEntry): string[] {
	const lines: string[] = []
	pushOptionalCatalogField(lines, 'id', entry.id)
	pushOptionalCatalogField(lines, 'ticker', entry.ticker)
	pushOptionalCatalogField(lines, 'name', entry.name)
	pushOptionalCatalogField(lines, 'type', englishEtfTypeLabel(entry.type))
	pushOptionalCatalogField(lines, 'description', entry.description)
	pushOptionalCatalogField(lines, 'isin', entry.isin)
	pushOptionalCatalogField(lines, 'expense_ratio', entry.expense_ratio)
	if (typeof entry.risk_kid === 'number') {
		lines.push(`- risk_kid: ${entry.risk_kid}`)
	}
	const riskBand = riskBandFromRiskKid(entry.risk_kid)
	if (riskBand !== undefined) {
		lines.push(`- risk_band (derived from risk_kid): ${riskBand}`)
	}
	pushOptionalCatalogField(lines, 'region', entry.region)
	pushOptionalCatalogField(lines, 'sector', entry.sector)
	if (typeof entry.rate_of_return === 'number') {
		lines.push(`- rate_of_return: ${entry.rate_of_return}`)
	}
	pushOptionalCatalogField(lines, 'volatility', entry.volatility)
	pushOptionalCatalogField(lines, 'return_risk', entry.return_risk)
	pushOptionalCatalogField(lines, 'fund_size', entry.fund_size)
	if (typeof entry.esg === 'boolean') {
		lines.push(`- esg: ${entry.esg}`)
	}
	return lines
}

function headingSlugForHolding(entry: EtfEntry, index: number): string {
	const label =
		entry.ticker?.trim() || entry.name.trim() || `Holding ${index + 1}`
	return label
}

/**
 * Builds an English Markdown snapshot of portfolio holdings (with catalog fields
 * when matched) and allocation guidelines, for copy-paste into external tools.
 */
export function buildLlmPortfolioGuidelinesMarkdownEnglish(params: {
	entries: EtfEntry[]
	guidelines: EtfGuideline[]
	catalog: CatalogEntry[]
	generatedAtUtc: Date
}): string {
	const { entries, guidelines, catalog, generatedAtUtc } = params
	const iso = generatedAtUtc.toISOString()
	const blocks: string[] = []
	blocks.push('# Portfolio and guidelines')
	blocks.push('')
	blocks.push(`As of (UTC): ${iso}`)
	blocks.push('')
	blocks.push('## Portfolio holdings')
	blocks.push('')
	const holdingsTotal = totalHoldingsValueForShareBars(entries)
	const canShowWeights =
		holdingsTotal !== null && holdingsTotal > 0 && entries.length > 0
	if (!canShowWeights && entries.length > 0) {
		blocks.push(
			'_Weights: omitted because holdings use more than one currency or the total is zero._',
		)
		blocks.push('')
	}
	if (entries.length === 0) {
		blocks.push('_No holdings._')
	} else {
		for (let index = 0; index < entries.length; index += 1) {
			const entry = entries[index]
			if (!entry) continue
			const title = headingSlugForHolding(entry, index)
			blocks.push(`### ${title}`)
			blocks.push('')
			const rowLines: string[] = []
			rowLines.push(`- portfolio_row_id: ${entry.id}`)
			rowLines.push(`- name: ${entry.name}`)
			if (entry.ticker !== undefined && entry.ticker.trim().length > 0) {
				rowLines.push(`- ticker: ${entry.ticker}`)
			}
			rowLines.push(`- value: ${formatDecimalEn(entry.value, 2)}`)
			rowLines.push(`- currency: ${entry.currency}`)
			if (entry.exchange !== undefined && entry.exchange.trim().length > 0) {
				rowLines.push(`- exchange: ${entry.exchange}`)
			}
			if (canShowWeights) {
				const pct = valueShareOfHoldingsTotalPercent({
					value: entry.value,
					total: holdingsTotal,
				})
				rowLines.push(
					`- share_of_portfolio_percent: ${formatDecimalEn(pct, 1)}`,
				)
			}
			blocks.push(...rowLines)
			blocks.push('')
			const catalogRow = catalogEntryForPortfolioRow(entry, catalog)
			blocks.push('#### Catalog match')
			blocks.push('')
			if (catalogRow === undefined) {
				blocks.push(
					'_No catalog row matched this holding (by ticker or name)._',
				)
			} else {
				blocks.push(...catalogEntryMarkdownLines(catalogRow))
			}
			blocks.push('')
		}
	}
	blocks.push('## Allocation guidelines')
	blocks.push('')
	if (guidelines.length === 0) {
		blocks.push('_No guidelines._')
	} else {
		const totalTargets = sumGuidelineTargetPercent(guidelines)
		blocks.push(
			`- sum_of_target_percent (all rows): ${formatDecimalEn(totalTargets, 2)}`,
		)
		blocks.push('')
		for (const row of guidelines) {
			const kindLabel =
				row.kind === 'instrument' ? 'instrument' : 'asset_class_bucket'
			const typeLabel = englishEtfTypeLabel(row.etfType)
			blocks.push(
				`- (${kindLabel}) **${row.etfName}** — target ${formatDecimalEn(row.targetPct, 2)}% — ETF type: ${typeLabel} (key: ${row.etfType})`,
			)
		}
	}
	blocks.push('')
	return blocks.join('\n')
}
