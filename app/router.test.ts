import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { router, resetEtfEntries } from './router.ts'

afterEach(() => {
  resetEtfEntries()
  delete process.env.GH_CLIENT_ID
})

describe('ETF homepage', () => {
  it('returns ok from the health endpoint', async () => {
    let response = await router.fetch('http://localhost/health')
    let body = await response.text()

    assert.equal(response.status, 200)
    assert.equal(body, 'ok')
  })

  it('renders the homepage and ETF form', async () => {
    let response = await router.fetch('http://localhost/')
    let body = await response.text()

    assert.equal(response.status, 200)
    assert.match(body, /AI Investor/)
    assert.match(body, /<form[^>]*method="post"[^>]*action="\/etfs"/)
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

  it('shows sign-in link when not authenticated', async () => {
    const response = await router.fetch('http://localhost/')
    const body = await response.text()

    assert.equal(response.status, 200)
    assert.match(body, /Sign in with GitHub/)
    assert.match(body, /href="\/auth\/github"/)
  })
})

describe('GitHub OAuth routes', () => {
  it('GET /auth/github returns 500 when GH_CLIENT_ID is not set', async () => {
    const response = await router.fetch('http://localhost/auth/github')
    assert.equal(response.status, 500)
  })

  it('GET /auth/github redirects to GitHub when GH_CLIENT_ID is set', async () => {
    process.env.GH_CLIENT_ID = 'test-client-id'
    const response = await router.fetch('http://localhost/auth/github')

    assert.equal(response.status, 302)
    const location = response.headers.get('location') ?? ''
    assert.ok(location.startsWith('https://github.com/login/oauth/authorize'))
    assert.ok(location.includes('client_id=test-client-id'))
    assert.ok(location.includes('scope=gist'))
  })

  it('POST /auth/logout clears the session cookie and redirects home', async () => {
    const response = await router.fetch(
      new Request('http://localhost/auth/logout', { method: 'POST' }),
    )

    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), '/')
    const cookie = response.headers.get('set-cookie') ?? ''
    assert.ok(cookie.includes('session=;') || cookie.includes('Max-Age=0'))
  })
})
