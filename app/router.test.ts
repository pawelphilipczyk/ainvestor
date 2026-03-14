import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { router, resetEtfEntries } from './router.ts'

afterEach(() => {
  resetEtfEntries()
})

describe('ETF homepage', () => {
  it('renders the homepage and ETF form', async () => {
    let response = await router.fetch('http://localhost/')
    let body = await response.text()

    assert.equal(response.status, 200)
    assert.match(body, /AI Investor/)
    assert.match(body, /<form method="post" action="\/etfs">/)
  })

  it('adds an ETF on form submit and displays it on homepage', async () => {
    let form = new FormData()
    form.set('etfName', 'VTI')
    form.set('status', 'have')

    let postResponse = await router.fetch(
      new Request('http://localhost/etfs', {
        method: 'POST',
        body: form,
      }),
    )

    assert.equal(postResponse.status, 302)
    assert.equal(postResponse.headers.get('location'), '/')

    let homeResponse = await router.fetch('http://localhost/')
    let homeBody = await homeResponse.text()

    assert.match(homeBody, /VTI/)
    assert.match(homeBody, /Have/)
  })
})
