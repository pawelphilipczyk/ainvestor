/**
 * Live OpenAI smoke test for `getInvestmentAdvice` (structured JSON + rich user message).
 *
 * Skipped unless both are set:
 * - `OPENAI_API_KEY`
 * - `RUN_ADVICE_OPENAI_SMOKE=1`
 *
 * Run (requires `OPENAI_API_KEY` in the environment):
 *   npm run test:smoke:advice
 */
import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import type { CatalogEntry } from '../catalog/lib.ts'
import { createAdviceClient } from './advice-client.ts'
import type { AdviceParagraphBlock } from './advice-document.ts'
import { getInvestmentAdvice } from './advice-openai.ts'

const runSmoke =
	process.env.RUN_ADVICE_OPENAI_SMOKE === '1' &&
	Boolean(process.env.OPENAI_API_KEY?.trim())

const smokeDescribe = runSmoke ? describe : describe.skip

smokeDescribe(
	'getInvestmentAdvice — OpenAI smoke (RUN_ADVICE_OPENAI_SMOKE=1)',
	() => {
		it('returns a parsed AdviceDocument with analysis bullets and numbered picks', {
			timeout: 120_000,
		}, async () => {
			const catalog: CatalogEntry[] = [
				{
					id: 'smoke-c1',
					ticker: 'VTI',
					name: 'Vanguard Total Stock Market ETF',
					type: 'equity',
					description: 'Broad US equity exposure',
					rate_of_return: 8.0,
					expense_ratio: '0.03%',
					volatility: 'medium',
				},
				{
					id: 'smoke-c2',
					ticker: 'BND',
					name: 'Vanguard Total Bond Market ETF',
					type: 'bond',
					description: 'US investment-grade bonds',
					rate_of_return: 4.0,
					expense_ratio: '0.05%',
				},
			]

			const guidelines: EtfGuideline[] = [
				{
					id: 'smoke-g1',
					kind: 'instrument',
					etfName: 'VTI',
					targetPct: 60,
					etfType: 'equity',
				},
				{
					id: 'smoke-g2',
					kind: 'instrument',
					etfName: 'BND',
					targetPct: 40,
					etfType: 'bond',
				},
			]

			const client = createAdviceClient()
			const advice = await getInvestmentAdvice({
				holdings: [
					{
						id: 'smoke-h1',
						name: 'Vanguard Total Stock Market ETF',
						ticker: 'VTI',
						value: 6000,
						currency: 'USD',
					},
				],
				guidelines,
				cashAmount: '2000',
				cashCurrency: 'USD',
				catalog,
				client,
			})

			assert.ok(advice.blocks.length >= 1, 'expected at least one block')

			const paragraphs = advice.blocks.filter(
				(b): b is AdviceParagraphBlock => b.type === 'paragraph',
			)
			assert.ok(paragraphs.length >= 1, 'expected at least one paragraph block')

			const combined = paragraphs.map((p) => p.text).join('\n\n')
			assert.ok(
				combined.length > 400,
				'expected substantial narrative (allocation + picks)',
			)

			assert.match(
				combined,
				/^-\s/m,
				'expected at least one markdown-style bullet (current state)',
			)
			assert.match(
				combined,
				/^\d+\.\s/m,
				'expected at least one numbered pick line',
			)
			assert.match(
				combined,
				/\bVTI\b/i,
				'expected catalog ticker VTI to appear in recommendations',
			)
		})
	},
)
