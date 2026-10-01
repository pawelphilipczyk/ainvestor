import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	commitMessage,
	describeAdviceMode,
	describeGuideline,
	describePortfolioOperation,
} from './commit-message.ts'

describe('commit messages', () => {
	it('appends where the write came from', () => {
		assert.equal(
			commitMessage({ summary: 'Buy SWDA LN: +1 PLN', source: 'MCP' }),
			'Buy SWDA LN: +1 PLN (MCP)',
		)
		assert.equal(
			commitMessage({ summary: 'Clear legacy advice', source: 'web' }),
			'Clear legacy advice (web)',
		)
	})

	it('describes a buy and a sell with the sign of the change, normalising case', () => {
		assert.equal(
			describePortfolioOperation({
				portfolioOperation: 'buy',
				instrumentTicker: ' swda ln ',
				value: 1,
				currency: 'pln',
			}),
			'Buy SWDA LN: +1 PLN',
		)
		assert.equal(
			describePortfolioOperation({
				portfolioOperation: 'sell',
				instrumentTicker: 'SWDA LN',
				value: 2.5,
				currency: 'EUR',
			}),
			'Sell SWDA LN: -2.5 EUR',
		)
	})

	it('calls a fund guideline by its fund and a bucket by its asset class', () => {
		assert.equal(
			describeGuideline({
				kind: 'instrument',
				etfName: 'IBCI LN',
				etfType: 'bond',
			}),
			'IBCI LN',
		)
		assert.equal(
			describeGuideline({ kind: 'asset_class', etfName: '', etfType: 'bond' }),
			'bond class',
		)
	})

	it('writes an advice mode with a hyphen', () => {
		assert.equal(describeAdviceMode('portfolio_review'), 'portfolio-review')
	})
})
