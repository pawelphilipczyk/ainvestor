import type { EtfEntry } from '../../lib/gist.ts'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import { format, type MessageKey, t } from '../../lib/i18n.ts'
import type { AdviceBlock, AdviceDocument } from './advice-document.ts'
import type { AdviceAnalysisMode, AdviceModelId } from './advice-openai.ts'
import {
	formatAggregatedGuidelineBucketsBlock,
	formatGuidelineLine,
} from './advice-openai.ts'

const ADVICE_MODEL_MESSAGE_KEYS = {
	'gpt-5.5': 'advice.model.gpt-5.5',
	'gpt-5.4-mini': 'advice.model.gpt-5.4-mini',
	'gpt-5.4-nano': 'advice.model.gpt-5.4-nano',
	'gpt-5.4': 'advice.model.gpt-5.4',
} as const satisfies Record<AdviceModelId, MessageKey>

function formatAdviceModelLabel(model: AdviceModelId): string {
	return t(ADVICE_MODEL_MESSAGE_KEYS[model])
}

function formatAdviceAnalysisModeLabel(mode: AdviceAnalysisMode): string {
	return mode === 'buy_next'
		? t('advice.analysisMode.buy_next')
		: t('advice.analysisMode.portfolio_review')
}

function formatAmountNumber(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount)
}

function formatPctOneDecimal(n: number): string {
	return `${new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 1,
	}).format(n)}%`
}

function formatAdviceBlocksForExport(blocks: AdviceBlock[]): string {
	const chunks: string[] = []
	for (const block of blocks) {
		if (block.type === 'paragraph') {
			chunks.push(block.text)
			continue
		}
		if (block.type === 'capital_snapshot') {
			const lines = block.segments.map(
				(segment) =>
					`- ${segment.label}: ${formatAmountNumber(segment.amount)} ${segment.currency} (${segment.role})`,
			)
			if (block.postTotal !== undefined) {
				lines.push(
					`- ${block.postTotal.label}: ${formatAmountNumber(block.postTotal.amount)} ${block.postTotal.currency}`,
				)
			}
			chunks.push(
				`[${t('advice.export.blockKind.capital_snapshot')}]\n${lines.join('\n')}`,
			)
			continue
		}
		if (block.type === 'guideline_bars') {
			const trimmedCaption = block.caption?.trim()
			const captionLine =
				trimmedCaption !== undefined && trimmedCaption.length > 0
					? `${trimmedCaption}\n`
					: ''
			const rowLines = block.rows.map((row) => {
				const postBuySuffix =
					row.postBuyPct !== undefined
						? ` → ${formatPctOneDecimal(row.postBuyPct)}`
						: ''
				return `- ${row.label}: ${formatPctOneDecimal(row.currentPct)} → ${formatPctOneDecimal(row.targetPct)}${postBuySuffix}`
			})
			chunks.push(
				`[${t('advice.export.blockKind.guideline_bars')}]\n${captionLine}${rowLines.join('\n')}`,
			)
			continue
		}
		const trimmedCaption = block.caption?.trim()
		const captionLine =
			trimmedCaption !== undefined && trimmedCaption.length > 0
				? `${trimmedCaption}\n`
				: ''
		const rowLines = block.rows.map((row) => {
			const ticker =
				row.ticker !== undefined && row.ticker.trim().length > 0
					? row.ticker.trim()
					: ''
			const amount =
				row.amount !== undefined ? formatAmountNumber(row.amount) : ''
			const currency =
				row.currency !== undefined && row.currency.length > 0
					? row.currency
					: ''
			const note =
				row.note !== undefined && row.note.trim().length > 0
					? row.note.trim()
					: ''
			return `- ${row.name} | ${ticker} | ${amount} ${currency} | ${note}`
		})
		chunks.push(
			`[${t('advice.export.blockKind.etf_proposals')}]\n${captionLine}${rowLines.join('\n')}`,
		)
	}
	return chunks.join('\n\n')
}

/**
 * Plain-text bundle of allocation guidelines, current portfolio rows, and the
 * structured advice output — for copying into external review tools.
 */
export function buildAdviceValidationExportText(params: {
	advice: AdviceDocument
	guidelines: EtfGuideline[]
	holdings: EtfEntry[]
	model: AdviceModelId
	analysisMode: AdviceAnalysisMode
	cashAmount?: string
	cashCurrency?: string
}): string {
	const modelLabel = formatAdviceModelLabel(params.model)
	const analysisModeLabel = formatAdviceAnalysisModeLabel(params.analysisMode)
	const metaLines = [
		format(t('advice.export.meta.model'), { model: modelLabel }),
		format(t('advice.export.meta.mode'), { mode: analysisModeLabel }),
	]
	const trimmedCash = params.cashAmount?.trim()
	if (
		params.analysisMode === 'buy_next' &&
		trimmedCash !== undefined &&
		trimmedCash.length > 0
	) {
		metaLines.push(
			format(t('advice.export.meta.cash'), {
				amount: trimmedCash,
				currency: params.cashCurrency ?? 'PLN',
			}),
		)
	}

	const aggregated = formatAggregatedGuidelineBucketsBlock(params.guidelines)
	const guidelinesBody =
		params.guidelines.length === 0
			? t('advice.export.guidelinesEmpty')
			: [
					...params.guidelines.map(formatGuidelineLine),
					...(aggregated !== null ? ['', aggregated] : []),
				].join('\n')

	const portfolioBody =
		params.holdings.length === 0
			? t('advice.export.portfolioEmpty')
			: params.holdings
					.map((holding) => {
						const tickerPart =
							holding.ticker !== undefined && holding.ticker.trim().length > 0
								? ` (${holding.ticker.trim()})`
								: ''
						return `- ${holding.name}${tickerPart}: ${formatAmountNumber(holding.value)} ${holding.currency}`
					})
					.join('\n')

	const sections = [
		`=== ${t('advice.export.section.guidelines')} ===\n${guidelinesBody}`,
		`=== ${t('advice.export.section.portfolio')} ===\n${portfolioBody}`,
		`=== ${t('advice.export.section.advice')} ===\n${formatAdviceBlocksForExport(params.advice.blocks)}`,
	]

	return [
		t('advice.export.documentTitle'),
		'',
		...metaLines,
		'',
		...sections,
	].join('\n')
}
