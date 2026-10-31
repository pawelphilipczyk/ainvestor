import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { baseCss } from '../../lib/document-styles.ts'
import {
	busyControlLabelClass,
	busyControlOverlayClass,
	busyControlRootStateClasses,
	busyControlSpinnerClass,
} from './busy-control-overlay.ts'

describe('busy-control-overlay', () => {
	it('keeps each busy-control marker class paired with a rule in the base CSS', () => {
		const markers = [
			busyControlRootStateClasses,
			busyControlLabelClass,
			busyControlOverlayClass,
		]
			.flatMap((classes) => classes.split(' '))
			.filter((token) => token.startsWith('busy-control-'))
		assert.deepEqual(markers, [
			'busy-control-root',
			'busy-control-label',
			'busy-control-overlay',
		])
		for (const marker of markers) {
			assert.match(baseCss, new RegExp(`\\.${marker}\\b`))
		}
	})

	it('makes the root a positioned group so the overlay can fill it', () => {
		const tokens = busyControlRootStateClasses.split(' ')
		assert.ok(tokens.includes('relative'))
		assert.ok(tokens.includes('group'))
	})

	it('draws the spinner as a fixed-size animated ring', () => {
		const tokens = busyControlSpinnerClass.split(' ')
		for (const token of [
			'h-4',
			'w-4',
			'shrink-0',
			'animate-spin',
			'rounded-full',
		]) {
			assert.ok(tokens.includes(token), `missing ${token}`)
		}
	})
})
