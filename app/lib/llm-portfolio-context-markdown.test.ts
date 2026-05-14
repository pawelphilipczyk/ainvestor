import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CatalogEntry } from '../features/catalog/lib.ts'
import type { EtfEntry } from './gist.ts'
import type { EtfGuideline } from './guidelines.ts'
import { buildLlmAdviceContextExportEnglish } from './llm-portfolio-context-markdown.ts'

const fixedInstant = new Date('2026-01-15T08:30:00.000Z')

describe('buildLlmAdviceContextExportEnglish', () => {
	it('includes holdings with catalog refs, guidelines, and catalog JSON array', () => {
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
		const { markdown, catalogJson } = buildLlmAdviceContextExportEnglish({
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
		const parsed = JSON.parse(catalogJson) as unknown
		assert.ok(Array.isArray(parsed))
		assert.equal(parsed.length, 2)
		assert.deepEqual(
			parsed.map((row: { ticker?: string }) => row.ticker),
			['BND', 'VTI'],
		)
	})

	it('omits weights when currencies differ', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
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
		const { markdown } = buildLlmAdviceContextExportEnglish({
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

	it('outputs _No holdings._ when entries array is empty', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [],
			guidelines: [],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.match(markdown, /_No holdings\._/)
		assert.doesNotMatch(markdown, /### /)
	})

	it('outputs _No guidelines._ when guidelines array is empty', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [],
			guidelines: [],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.match(markdown, /_No guidelines\._/)
		assert.doesNotMatch(markdown, /sum_of_target_percent/)
	})

	it('matches catalog entry by name when ticker is absent', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [
				{
					id: 'n1',
					name: 'Vanguard Total Bond',
					value: 2000,
					currency: 'USD',
				},
			],
			guidelines: [],
			catalog: [
				{
					id: 'cat-bnd',
					ticker: 'BND',
					name: 'Vanguard Total Bond',
					type: 'bond',
					description: 'US bond market',
					risk_kid: 3,
					esg: false,
				},
			],
			generatedAtUtc: fixedInstant,
		})
		assert.match(markdown, /- matched: yes/)
		assert.match(markdown, /- catalog_id: cat-bnd/)
		assert.match(markdown, /- catalog_ticker: BND/)
	})

	it('uses holding name as heading and omits ticker line when ticker is absent', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [
				{
					id: 'n2',
					name: 'My Fund',
					value: 500,
					currency: 'EUR',
				},
			],
			guidelines: [],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.match(markdown, /### My Fund/)
		assert.doesNotMatch(markdown, /- ticker:/)
	})

	it('includes exchange line when exchange field is present', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [
				{
					id: 'e1',
					name: 'Some ETF',
					ticker: 'SET',
					value: 1000,
					currency: 'PLN',
					exchange: 'WSE',
				},
			],
			guidelines: [],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.match(markdown, /- exchange: WSE/)
	})

	it('omits exchange line when exchange field is absent', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [
				{
					id: 'e2',
					name: 'Another ETF',
					ticker: 'AET',
					value: 1000,
					currency: 'PLN',
				},
			],
			guidelines: [],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.doesNotMatch(markdown, /- exchange:/)
	})

	it('shows share_of_portfolio_percent as 100.0 for a single holding', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [
				{
					id: 's1',
					name: 'Solo Fund',
					ticker: 'SOL',
					value: 5000,
					currency: 'EUR',
				},
			],
			guidelines: [],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.match(markdown, /- share_of_portfolio_percent: 100\.0/)
	})

	it('formats the generated-at timestamp using ISO 8601', () => {
		const instant = new Date('2025-03-07T12:00:00.000Z')
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [],
			guidelines: [],
			catalog: [],
			generatedAtUtc: instant,
		})
		assert.match(markdown, /As of \(UTC\): 2025-03-07T12:00:00\.000Z/)
	})

	it('catalogJson is valid JSON, ends with a newline, and is sorted by ticker', () => {
		const { catalogJson } = buildLlmAdviceContextExportEnglish({
			entries: [],
			guidelines: [],
			catalog: [
				{
					id: 'z',
					ticker: 'ZZZ',
					name: 'Z Fund',
					type: 'equity',
					description: '',
					risk_kid: 1,
					esg: false,
				},
				{
					id: 'a',
					ticker: 'AAA',
					name: 'A Fund',
					type: 'bond',
					description: '',
					risk_kid: 2,
					esg: true,
				},
			],
			generatedAtUtc: fixedInstant,
		})
		assert.ok(catalogJson.endsWith('\n'), 'catalogJson should end with a newline')
		const parsed = JSON.parse(catalogJson) as unknown
		assert.ok(Array.isArray(parsed))
		assert.equal((parsed as Array<{ ticker: string }>)[0]?.ticker, 'AAA')
		assert.equal((parsed as Array<{ ticker: string }>)[1]?.ticker, 'ZZZ')
	})

	it('uses multi-word ETF type labels from ETF_TYPE_LABELS (real_estate → real estate)', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [],
			guidelines: [
				{
					id: 'gr',
					kind: 'asset_class',
					etfName: 'real_estate',
					targetPct: 10,
					etfType: 'real_estate',
				},
				{
					id: 'gm',
					kind: 'asset_class',
					etfName: 'money_market',
					targetPct: 5,
					etfType: 'money_market',
				},
			],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.match(markdown, /ETF type: real estate \(key: real_estate\)/)
		assert.match(markdown, /ETF type: money market \(key: money_market\)/)
	})

	it('shows partial guideline sum when targets do not add to 100', () => {
		const { markdown } = buildLlmAdviceContextExportEnglish({
			entries: [],
			guidelines: [
				{
					id: 'g1',
					kind: 'instrument',
					etfName: 'VTI',
					targetPct: 30,
					etfType: 'equity',
				},
			],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		assert.match(markdown, /sum_of_target_percent \(all rows\): 30\.00/)
	})

	it('empty catalogJson array when catalog is empty', () => {
		const { catalogJson } = buildLlmAdviceContextExportEnglish({
			entries: [],
			guidelines: [],
			catalog: [],
			generatedAtUtc: fixedInstant,
		})
		const parsed = JSON.parse(catalogJson) as unknown
		assert.ok(Array.isArray(parsed))
		assert.equal((parsed as unknown[]).length, 0)
	})
})
