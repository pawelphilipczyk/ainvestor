import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isPreview } from './deployment.ts'

describe('isPreview', () => {
	it('isPreview returns true when FLY_APP_NAME is ainvestor-preview', () => {
		const previousFlyAppName = process.env.FLY_APP_NAME
		try {
			process.env.FLY_APP_NAME = 'ainvestor-preview'
			assert.equal(isPreview(), true)
		} finally {
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})

	it('isPreview returns false for production or unset env', () => {
		const previousFlyAppName = process.env.FLY_APP_NAME
		try {
			delete process.env.FLY_APP_NAME
			assert.equal(isPreview(), false)
			process.env.FLY_APP_NAME = 'ainvestor'
			assert.equal(isPreview(), false)
		} finally {
			if (previousFlyAppName === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = previousFlyAppName
		}
	})
})
