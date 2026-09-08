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

	it('does not rewrite a bucket word found inside an unrelated word', () => {
		runWithUiCopyContext({ locale: 'en', shellReturnPath: '/' }, () => {
			assert.equal(
				localizeEtfBucketTermsInAdviceProse(
					'Rynkowe reakcje na akcje były silne.',
				),
				'Rynkowe reakcje na equity były silne.',
			)
		})
	})

	it('leaves the ambiguous word "mixed"/"Mieszany" alone in free-form prose', () => {
		runWithUiCopyContext({ locale: 'pl', shellReturnPath: '/' }, () => {
			assert.equal(
				localizeEtfBucketTermsInAdviceProse(
					'Your results this month were mixed across sectors.',
				),
				'Your results this month were mixed across sectors.',
			)
		})
		runWithUiCopyContext({ locale: 'en', shellReturnPath: '/' }, () => {
			assert.equal(
				localizeEtfBucketTermsInAdviceProse(
					'Wyniki były Mieszany w tym miesiącu.',
				),
				'Wyniki były Mieszany w tym miesiącu.',
			)
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
					postBuyPct: undefined,
				}),
				'bond',
			)
			assert.equal(
				getAdviceGuidelineBarRowDisplayLabel({
					label: 'Akcje',
					etfType: undefined,
					targetPct: 60,
					currentPct: 50,
					postBuyPct: undefined,
				}),
				'equity',
			)
			assert.equal(
				getAdviceGuidelineBarRowDisplayLabel({
					label: 'Custom sleeve',
					etfType: undefined,
					targetPct: 10,
					currentPct: 5,
					postBuyPct: undefined,
				}),
				'Custom sleeve',
			)
		})
	})
})
