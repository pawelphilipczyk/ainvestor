import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	getAdviceGuidelineBarRowDisplayLabel,
	localizeEtfBucketTermsInAdviceProse,
} from './advice-locale-bridge.ts'
import { runWithUiCopyContext } from './ui-locale.ts'

describe('advice-locale-bridge', () => {
	it('localizeEtfBucketTermsInAdviceProse maps Polish bucket words to English', () => {
		runWithUiCopyContext({ locale: 'en', shellReturnPath: '/' }, () => {
			assert.equal(
				localizeEtfBucketTermsInAdviceProse('- **Akcje** vs **Obligacje**.'),
				'- **equity** vs **bond**.',
			)
		})
	})

	it('localizeEtfBucketTermsInAdviceProse maps English bucket words to Polish', () => {
		runWithUiCopyContext({ locale: 'pl', shellReturnPath: '/' }, () => {
			const out = localizeEtfBucketTermsInAdviceProse(
				'- Underweight equity; add real estate.',
			)
			assert.match(out, /Akcje/)
			assert.match(out, /nieruchomości/i)
		})
	})

	it('getAdviceGuidelineBarRowDisplayLabel prefers etfType then inferred label', () => {
		runWithUiCopyContext({ locale: 'en', shellReturnPath: '/' }, () => {
			assert.equal(
				getAdviceGuidelineBarRowDisplayLabel({
					label: 'ignored display',
					etfType: 'bond',
					targetPct: 40,
					currentPct: 30,
				}),
				'bond',
			)
			assert.equal(
				getAdviceGuidelineBarRowDisplayLabel({
					label: 'Akcje',
					targetPct: 60,
					currentPct: 50,
				}),
				'equity',
			)
			assert.equal(
				getAdviceGuidelineBarRowDisplayLabel({
					label: 'Custom sleeve',
					targetPct: 10,
					currentPct: 5,
				}),
				'Custom sleeve',
			)
		})
	})
})
