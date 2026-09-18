import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	formControlHeightCompact,
	formControlHeightDefault,
	selectControlCompactClasses,
	selectControlDefaultClasses,
	submitButtonCompactClasses,
	submitButtonDefaultClasses,
	textNumberControlCompactClasses,
	textNumberControlDefaultClasses,
} from './form-control-classes.ts'

describe('form-control-classes', () => {
	it('pins the default and compact height tiers', () => {
		assert.equal(formControlHeightDefault, 'h-10 min-h-10')
		assert.equal(formControlHeightCompact, 'h-9 min-h-9')
	})

	it('composes each control default classes with the default height', () => {
		for (const classes of [
			textNumberControlDefaultClasses,
			selectControlDefaultClasses,
			submitButtonDefaultClasses,
		]) {
			assert.match(classes, /\bh-10\b/)
			assert.match(classes, /\bmin-h-10\b/)
			assert.doesNotMatch(classes, /\bh-9\b/)
			assert.doesNotMatch(classes, /\bmin-h-9\b/)
		}
	})

	it('composes each control compact classes with the compact height', () => {
		for (const classes of [
			textNumberControlCompactClasses,
			selectControlCompactClasses,
			submitButtonCompactClasses,
		]) {
			assert.match(classes, /\bh-9\b/)
			assert.match(classes, /\bmin-h-9\b/)
			assert.doesNotMatch(classes, /\bh-10\b/)
			assert.doesNotMatch(classes, /\bmin-h-10\b/)
		}
	})
})
