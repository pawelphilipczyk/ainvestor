import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EtfGuideline } from './guidelines.ts'
import {
	buildGuidelinesGistPatch,
	clampGuidelineBarWidthPercent,
	findGuidelineDuplicateOf,
	formatEtfTypeLabel,
	formatGuidelineTargetPercentForInput,
	GUIDELINES_FILENAME,
	normalizeGuideline,
	parseGuidelinesFromGist,
	resolveEtfTypeFromAdviceBucketLabel,
	sumGuidelineTargetPercent,
	wouldGuidelineTotalExceedCap,
} from './guidelines.ts'
import { runWithUiCopyContext } from './ui-locale.ts'

describe('guidelines', () => {
	it('formatEtfTypeLabel uses English labels by default', () => {
		assert.equal(formatEtfTypeLabel('real_estate'), 'real estate')
		assert.equal(formatEtfTypeLabel('money_market'), 'money market')
	})

	it('formatEtfTypeLabel uses Polish labels when UI locale is pl', () => {
		runWithUiCopyContext({ locale: 'pl', shellReturnPath: '/' }, () => {
			assert.equal(formatEtfTypeLabel('equity'), 'Akcje')
			assert.equal(formatEtfTypeLabel('bond'), 'Obligacje')
			assert.equal(formatEtfTypeLabel('real_estate'), 'Nieruchomości')
		})
	})

	it('resolveEtfTypeFromAdviceBucketLabel maps localized and model labels', () => {
		assert.equal(resolveEtfTypeFromAdviceBucketLabel('Akcje'), 'equity')
		assert.equal(
			resolveEtfTypeFromAdviceBucketLabel('Nieruchomości'),
			'real_estate',
		)
		assert.equal(resolveEtfTypeFromAdviceBucketLabel('Bonds'), 'bond')
		assert.equal(
			resolveEtfTypeFromAdviceBucketLabel('Equities (bucket)'),
			'equity',
		)
		assert.equal(resolveEtfTypeFromAdviceBucketLabel(''), undefined)
		assert.equal(resolveEtfTypeFromAdviceBucketLabel('VTI'), undefined)
	})

	it('GUIDELINES_FILENAME is a non-empty string', () => {
		assert.equal(typeof GUIDELINES_FILENAME, 'string')
		assert.ok(GUIDELINES_FILENAME.length > 0)
	})

	it('parseGuidelinesFromGist returns empty array when file is missing', () => {
		const result = parseGuidelinesFromGist({ files: {} })
		assert.deepEqual(result, [])
	})

	it('parseGuidelinesFromGist returns empty array when content is null', () => {
		const result = parseGuidelinesFromGist({
			files: { [GUIDELINES_FILENAME]: { content: null } },
		})
		assert.deepEqual(result, [])
	})

	it('parseGuidelinesFromGist parses valid guidelines JSON', () => {
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
				kind: 'instrument',
				etfName: 'BND',
				targetPct: 30,
				etfType: 'bond',
			},
		]
		const result = parseGuidelinesFromGist({
			files: { [GUIDELINES_FILENAME]: { content: JSON.stringify(guidelines) } },
		})
		assert.deepEqual(result, guidelines)
	})

	it('parseGuidelinesFromGist infers kind instrument when omitted (legacy)', () => {
		const stored = [
			{ id: 'g1', etfName: 'VTI', targetPct: 60, etfType: 'equity' },
		]
		const result = parseGuidelinesFromGist({
			files: { [GUIDELINES_FILENAME]: { content: JSON.stringify(stored) } },
		})
		assert.deepEqual(result, [
			{
				id: 'g1',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 60,
				etfType: 'equity',
			},
		])
	})

	it('normalizeGuideline clears etfName for asset_class rows', () => {
		const normalized = normalizeGuideline({
			id: 'a1',
			kind: 'asset_class',
			etfName: '  ignored  ',
			targetPct: 60,
			etfType: 'equity',
		})
		assert.deepEqual(normalized, {
			id: 'a1',
			kind: 'asset_class',
			etfName: '',
			targetPct: 60,
			etfType: 'equity',
		})
	})

	it('parseGuidelinesFromGist returns empty array for invalid JSON', () => {
		const result = parseGuidelinesFromGist({
			files: { [GUIDELINES_FILENAME]: { content: 'not-json!!!' } },
		})
		assert.deepEqual(result, [])
	})

	it('sumGuidelineTargetPercent sums all rows', () => {
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
				etfName: '',
				targetPct: 40.5,
				etfType: 'bond',
			},
		]
		assert.equal(sumGuidelineTargetPercent(guidelines), 100.5)
	})

	it('sumGuidelineTargetPercent treats non-finite targetPct as 0', () => {
		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: Number.NaN,
				etfType: 'equity',
			},
			{
				id: 'g2',
				kind: 'instrument',
				etfName: 'BND',
				targetPct: 30,
				etfType: 'bond',
			},
		]
		assert.equal(sumGuidelineTargetPercent(guidelines), 30)
	})

	it('formatGuidelineTargetPercentForInput returns 0 for non-finite values', () => {
		assert.equal(formatGuidelineTargetPercentForInput(Number.NaN), '0')
		assert.equal(
			formatGuidelineTargetPercentForInput(Number.POSITIVE_INFINITY),
			'0',
		)
	})

	it('clampGuidelineBarWidthPercent clamps to 0–100 and treats non-finite as 0', () => {
		assert.equal(clampGuidelineBarWidthPercent(Number.NaN), 0)
		assert.equal(clampGuidelineBarWidthPercent(-5), 0)
		assert.equal(clampGuidelineBarWidthPercent(150), 100)
		assert.equal(clampGuidelineBarWidthPercent(25), 25)
	})

	it('findGuidelineDuplicateOf matches instrument by ticker case-insensitively', () => {
		const existing: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 60,
				etfType: 'equity',
			},
		]
		const duplicate = findGuidelineDuplicateOf(existing, {
			id: 'new',
			kind: 'instrument',
			etfName: 'vti',
			targetPct: 10,
			etfType: 'equity',
		})
		assert.equal(duplicate?.id, 'g1')
		assert.equal(
			findGuidelineDuplicateOf(existing, {
				id: 'new',
				kind: 'instrument',
				etfName: ' vti ',
				targetPct: 10,
				etfType: 'equity',
			})?.id,
			'g1',
		)
		assert.equal(
			findGuidelineDuplicateOf(existing, {
				id: 'new',
				kind: 'instrument',
				etfName: '\tvti\n',
				targetPct: 10,
				etfType: 'equity',
			})?.id,
			'g1',
		)
		assert.equal(
			findGuidelineDuplicateOf(existing, {
				id: 'new',
				kind: 'instrument',
				etfName: 'BND',
				targetPct: 10,
				etfType: 'bond',
			}),
			null,
		)
	})

	it('findGuidelineDuplicateOf ignores cross-kind collisions', () => {
		const existing: EtfGuideline[] = [
			{
				id: 'b1',
				kind: 'asset_class',
				etfName: '',
				targetPct: 40,
				etfType: 'equity',
			},
		]
		assert.equal(
			findGuidelineDuplicateOf(existing, {
				id: 'new',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 20,
				etfType: 'equity',
			}),
			null,
		)
	})

	it('findGuidelineDuplicateOf matches asset_class by etfType', () => {
		const existing: EtfGuideline[] = [
			{
				id: 'b1',
				kind: 'asset_class',
				etfName: '',
				targetPct: 40,
				etfType: 'equity',
			},
		]
		assert.equal(
			findGuidelineDuplicateOf(existing, {
				id: 'new',
				kind: 'asset_class',
				etfName: '',
				targetPct: 20,
				etfType: 'equity',
			})?.id,
			'b1',
		)
		assert.equal(
			findGuidelineDuplicateOf(existing, {
				id: 'new',
				kind: 'asset_class',
				etfName: '',
				targetPct: 20,
				etfType: 'bond',
			}),
			null,
		)
	})

	it('wouldGuidelineTotalExceedCap is false when new total is at most 100', () => {
		const existing: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 60,
				etfType: 'equity',
			},
		]
		assert.equal(
			wouldGuidelineTotalExceedCap({ existing, additionalPercent: 40 }),
			false,
		)
		assert.equal(
			wouldGuidelineTotalExceedCap({ existing, additionalPercent: 40.01 }),
			true,
		)
	})

	it('buildGuidelinesGistPatch produces a PATCH-ready body', () => {
		const guidelines: EtfGuideline[] = [
			{
				id: 'g1',
				kind: 'instrument',
				etfName: 'VTI',
				targetPct: 60,
				etfType: 'equity',
			},
		]
		const patch = buildGuidelinesGistPatch(guidelines)

		assert.ok(patch.files[GUIDELINES_FILENAME])
		assert.equal(
			patch.files[GUIDELINES_FILENAME].content,
			JSON.stringify(guidelines, null, 2),
		)
	})
})
