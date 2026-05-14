import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CatalogEntry } from '../features/catalog/lib.ts'
import type { EtfEntry } from './gist.ts'
import type { EtfGuideline } from './guidelines.ts'
import {
	buildAdviceContextMarkdownEnglish,
	serializeAdviceContextCatalogJsonEnglish,
} from './llm-portfolio-context-markdown.ts'

const fixedInstant = new Date('2026-01-15T08:30:00.000Z')

describe('buildAdviceContextMarkdownEnglish', () => {
	it('includes holdings with catalog refs and guidelines', () => {
		const entries: EtfEntry[] = [
			{
				id: 'e1',
				name: 'Vanguard Total Stock',
				ticker: 'VTI',
				value: 6000,
				currency: 'USD',
			},
			{
				id: 'e2',
				name: 'Vanguard Total Bond',
				ticker: 'BND',
				value: 4000,
				currency: 'USD',
			},
		]
		const catalog: CatalogEntry[] = [
			{
				id: 'cat-bnd',
				ticker: 'BND',
				name: 'Vanguard Total Bond',
				type: 'bond',
				description: 'US bonds',
				risk_kid: 3,
				esg: true,
			},
			{
				id: 'cat-vti',
				ticker: 'VTI',
				name: 'Vanguard Total Stock',
				type: 'equity',
				description: 'US total market',
				expense_ratio: '0.03%',
				risk_kid: 5,
				region: 'North America',
				sector: 'broad',
				rate_of_return: 8.1,
				volatility: '16%',
				return_risk: '0.5',
				fund_size: '300 bn USD',
				esg: false,
			},
		]
		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 60,
				etfType: 'equity',
			},
			{
				id: 'g2',
				kind: 'asset_class',
				etfName: 'bond',
				targetPct: 40,
				etfType: 'bond',
			},
		]
		const markdown = buildAdviceContextMarkdownEnglish({
			entries,
			guidelines,
			catalog,
			generatedAtUtc: fixedInstant,
		})
		assert.equal(
			markdown,
			[
				'# Portfolio and guidelines',
				'',
				'As of (UTC): 2026-01-15T08:30:00.000Z',
				'',
				'_Full ETF attributes (fees, risk KID, region, etc.) live in the companion **catalog JSON** on the export page. Each holding below references a catalog row by `id` / `ticker` when matched._',
				'',
				'## Portfolio holdings',
				'',
				'### VTI',
				'',
				'- portfolio_row_id: e1',
				'- name: Vanguard Total Stock',
				'- ticker: VTI',
				'- value: 6,000.00',
				'- currency: USD',
				'- share_of_portfolio_percent: 60.0',
				'',
				'#### Catalog match',
				'',
				'- matched: yes',
				'- catalog_id: cat-vti',
				'- catalog_ticker: VTI',
				'',
				'### BND',
				'',
				'- portfolio_row_id: e2',
				'- name: Vanguard Total Bond',
				'- ticker: BND',
				'- value: 4,000.00',
				'- currency: USD',
				'- share_of_portfolio_percent: 40.0',
				'',
				'#### Catalog match',
				'',
				'- matched: yes',
				'- catalog_id: cat-bnd',
				'- catalog_ticker: BND',
				'',
				'## Allocation guidelines',
				'',
				'- sum_of_target_percent (all rows): 100.00',
				'',
				'- (instrument) **VTI** — target 60.00% — ETF type: equity (key: equity)',
				'- (asset_class_bucket) **bond** — target 40.00% — ETF type: bond (key: bond)',
				'',
			].join('\n'),
		)
		const catalogJson = serializeAdviceContextCatalogJsonEnglish(catalog)
		const parsed = JSON.parse(catalogJson) as unknown
		assert.ok(Array.isArray(parsed))
		assert.equal(parsed.length, 2)
		assert.deepEqual(
			parsed.map((row: { ticker?: string }) => row.ticker),
			['BND', 'VTI'],
		)
	})

	it('omits weights when currencies differ', () => {
		const markdown = buildAdviceContextMarkdownEnglish({
			entries: [
				{
					id: 'a',
					name: 'Fund A',
					ticker: 'AAA',
					value: 100,
					currency: 'PLN',
				},
				{
					id: 'b',
					name: 'Fund B',
					ticker: 'BBB',
					value: 50,
					currency: 'USD',
				},
			],
			guidelines: [],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.match(
			markdown,
			/Weights: omitted because holdings use more than one currency/,
		)
		assert.doesNotMatch(markdown, /share_of_portfolio_percent/)
	})

	it('notes missing catalog match', () => {
		const markdown = buildAdviceContextMarkdownEnglish({
			entries: [
				{
					id: 'x',
					name: 'Unknown Local Name',
					value: 1,
					currency: 'PLN',
				},
			],
			guidelines: [],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.match(markdown, /- matched: no/)
		assert.match(
			markdown,
			/No catalog row matched this holding \(by ticker or name\)/,
		)
	})
})

describe('serializeAdviceContextCatalogJsonEnglish', () => {
	it('returns valid JSON array sorted by ticker', () => {
		const catalog: CatalogEntry[] = [
			{ id: '2', ticker: 'ZZZ', name: 'Z', type: 'equity', description: '' },
			{ id: '1', ticker: 'AAA', name: 'A', type: 'bond', description: '' },
		]
		const out = serializeAdviceContextCatalogJsonEnglish(catalog)
		const parsed = JSON.parse(out) as CatalogEntry[]
		assert.deepEqual(
			parsed.map((row) => row.ticker),
			['AAA', 'ZZZ'],
		)
	})
})
