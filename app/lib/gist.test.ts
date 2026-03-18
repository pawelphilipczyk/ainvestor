import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	buildGistBody,
	GIST_FILENAME,
	getGistDescription,
	isPreview,
	parseEtfsFromGist,
} from './gist.ts'

describe('gist', () => {
	it('exports the expected constants', () => {
		assert.equal(typeof GIST_FILENAME, 'string')
		assert.equal(typeof getGistDescription, 'function')
	})

	it('parseEtfsFromGist returns empty array for missing file', () => {
		const result = parseEtfsFromGist({ files: {} })
		assert.deepEqual(result, [])
	})

	it('parseEtfsFromGist returns empty array for null content', () => {
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: null } },
		})
		assert.deepEqual(result, [])
	})

	it('parseEtfsFromGist parses valid ETF JSON with new fields', () => {
		const entries = [
			{ id: 'abc-1', name: 'VTI', value: 1200.5, currency: 'USD' },
			{ id: 'abc-2', name: 'VWCE', value: 3400, currency: 'EUR' },
		]
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: JSON.stringify(entries) } },
		})
		assert.deepEqual(result, entries)
	})

	it('parseEtfsFromGist returns empty array for invalid JSON', () => {
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: 'not-json!!!' } },
		})
		assert.deepEqual(result, [])
	})

	it('buildGistBody creates a valid create-gist request body', () => {
		const entries = [{ id: 'abc-1', name: 'SPY', value: 500, currency: 'USD' }]
		const body = buildGistBody(entries)

		assert.equal(body.description, 'ai-investor-data')
		assert.equal(body.public, false)
		assert.ok(body.files[GIST_FILENAME])
		assert.equal(
			body.files[GIST_FILENAME].content,
			JSON.stringify(entries, null, 2),
		)
	})

	it('isPreview returns true when FLY_APP_NAME is ainvestor-preview', () => {
		const prev = process.env.FLY_APP_NAME
		try {
			process.env.FLY_APP_NAME = 'ainvestor-preview'
			assert.equal(isPreview(), true)
		} finally {
			if (prev === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = prev
		}
	})

	it('isPreview returns false for production or unset env', () => {
		const prev = process.env.FLY_APP_NAME
		try {
			delete process.env.FLY_APP_NAME
			assert.equal(isPreview(), false)
			process.env.FLY_APP_NAME = 'ainvestor'
			assert.equal(isPreview(), false)
		} finally {
			if (prev === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = prev
		}
	})

	it('getGistDescription returns preview suffix when FLY_APP_NAME is ainvestor-preview', () => {
		const prev = process.env.FLY_APP_NAME
		try {
			process.env.FLY_APP_NAME = 'ainvestor-preview'
			assert.equal(getGistDescription(), 'ai-investor-preview-data')
		} finally {
			if (prev === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = prev
		}
	})

	it('getGistDescription returns base description for production or unset env', () => {
		const prev = process.env.FLY_APP_NAME
		try {
			delete process.env.FLY_APP_NAME
			assert.equal(getGistDescription(), 'ai-investor-data')
			process.env.FLY_APP_NAME = 'ainvestor'
			assert.equal(getGistDescription(), 'ai-investor-data')
		} finally {
			if (prev === undefined) delete process.env.FLY_APP_NAME
			else process.env.FLY_APP_NAME = prev
		}
	})
})
