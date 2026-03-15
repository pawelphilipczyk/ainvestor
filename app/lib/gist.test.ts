import * as assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'

import { parseEtfsFromGist, buildGistBody, GIST_FILENAME, GIST_DESCRIPTION } from './gist.ts'

describe('gist', () => {
  it('exports the expected constants', () => {
    assert.equal(typeof GIST_FILENAME, 'string')
    assert.equal(typeof GIST_DESCRIPTION, 'string')
  })

  it('parseEtfsFromGist returns empty array for missing file', () => {
    const result = parseEtfsFromGist({ files: {} })
    assert.deepEqual(result, [])
  })

  it('parseEtfsFromGist returns empty array for null content', () => {
    const result = parseEtfsFromGist({ files: { [GIST_FILENAME]: { content: null } } })
    assert.deepEqual(result, [])
  })

  it('parseEtfsFromGist parses valid ETF JSON', () => {
    const entries = [
      { name: 'VTI', status: 'have' },
      { name: 'QQQ', status: 'want_to_buy' },
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
    const entries = [{ name: 'SPY', status: 'have' }]
    const body = buildGistBody(entries)

    assert.equal(body.description, GIST_DESCRIPTION)
    assert.equal(body.public, false)
    assert.ok(body.files[GIST_FILENAME])
    assert.equal(body.files[GIST_FILENAME].content, JSON.stringify(entries, null, 2))
  })
})
