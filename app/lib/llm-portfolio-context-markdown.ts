import type { CatalogEntry } from '../features/catalog/lib.ts'
import { findCatalogEntryByTicker } from '../features/catalog/lib.ts'
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

function headingSlugForHolding(entry: EtfEntry, index: number): string {
	const label =
		entry.ticker?.trim() || entry.name.trim() || `Holding ${index + 1}`
	return label
}

/**
 * Markdown export: portfolio holdings (with catalog id/ticker refs) and
 * allocation guidelines. Full fund rows are at `catalogJsonUrl` (shared JSON).
 */
export function buildAdviceContextMarkdown(params: {
	entries: EtfEntry[]
	guidelines: EtfGuideline[]
	catalog: CatalogEntry[]
	/** Absolute URL to `GET` the shared catalog JSON (sorted by ticker). */
	catalogJsonUrl: string
	generatedAtUtc: Date
}): string {
	const { entries, guidelines, catalog, catalogJsonUrl, generatedAtUtc } =
		params
	const iso = generatedAtUtc.toISOString()
	const blocks: string[] = []
	blocks.push('# Portfolio and guidelines')
	blocks.push('')
	blocks.push(`As of (UTC): ${iso}`)
	blocks.push('')
	blocks.push(
		`_Full ETF attributes (fees, risk KID, region, etc.): fetch the shared catalog JSON at \`${catalogJsonUrl}\` (GET; sorted by ticker). Each holding below references a row by \`id\` / \`ticker\` when matched._`,
	)
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
				blocks.push('- matched: no')
				blocks.push(
					'_No catalog row matched this holding (by ticker or name); use the catalog JSON URL for available funds._',
				)
			} else {
				blocks.push('- matched: yes')
				blocks.push(`- catalog_id: ${catalogRow.id}`)
				blocks.push(`- catalog_ticker: ${catalogRow.ticker}`)
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
