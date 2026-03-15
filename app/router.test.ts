import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { router, resetEtfEntries, setAdviceClient } from './router.ts'
import type { AdviceClient } from './openai.ts'

function makeMockClient(responseText: string): AdviceClient {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: responseText } }],
        }),
      },
    },
  }
}

afterEach(() => {
  resetEtfEntries()
  setAdviceClient(null)
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

  it('form has name, value and currency fields', async () => {
    let response = await router.fetch('http://localhost/')
    let body = await response.text()

    assert.match(body, /name="etfName"/)
    assert.match(body, /name="value"/)
    assert.match(body, /name="currency"/)
  })

  it('returns 400 when cashAmount is missing from advice request', async () => {
    setAdviceClient(makeMockClient('irrelevant'))
    let form = new FormData()

    let response = await router.fetch(
      new Request('http://localhost/advice', { method: 'POST', body: form }),
    )

    assert.equal(response.status, 400)
  })

  it('returns advice HTML from the LLM when cashAmount is provided', async () => {
    setAdviceClient(makeMockClient('Buy VTI for broad market exposure.'))

    let form = new FormData()
    form.set('cashAmount', '1000')

    let response = await router.fetch(
      new Request('http://localhost/advice', { method: 'POST', body: form }),
    )
    let body = await response.text()

    assert.equal(response.status, 200)
    assert.match(body, /Buy VTI for broad market exposure\./)
  })

  it('includes current ETF holdings in the advice context', async () => {
    let capturedUserMessage = ''
    const capturingClient: AdviceClient = {
      chat: {
        completions: {
          create: async params => {
            capturedUserMessage = params.messages[1].content
            return { choices: [{ message: { content: 'advice' } }] }
          },
        },
      },
    }
    setAdviceClient(capturingClient)

    // First add an ETF with the new schema
    let addForm = new FormData()
    addForm.set('etfName', 'VXUS')
    addForm.set('value', '3000')
    addForm.set('currency', 'USD')
    await router.fetch(new Request('http://localhost/etfs', { method: 'POST', body: addForm }))

    // Then ask for advice
    let adviceForm = new FormData()
    adviceForm.set('cashAmount', '500')
    await router.fetch(new Request('http://localhost/advice', { method: 'POST', body: adviceForm }))

    assert.match(capturedUserMessage, /VXUS/)
    assert.match(capturedUserMessage, /3000 USD/)
    assert.match(capturedUserMessage, /\$500/)
  })

  it('adds an ETF on form submit and displays it on homepage', async () => {
    let form = new FormData()
    form.set('etfName', 'VTI')
    form.set('value', '1200.50')
    form.set('currency', 'USD')

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
    assert.match(homeBody, /1[,.]?200/)
    assert.match(homeBody, /USD/)
  })

  it('shows sign-in link when not authenticated', async () => {
    const response = await router.fetch('http://localhost/')
    const body = await response.text()

    assert.equal(response.status, 200)
    assert.match(body, /Sign in with GitHub/)
    assert.match(body, /href="\/auth\/github"/)
  })

  it('renders advice form section on the homepage', async () => {
    const response = await router.fetch('http://localhost/')
    const body = await response.text()

    assert.match(body, /Get Advice/)
    assert.match(body, /name="cashAmount"/)
    assert.match(body, /action="\/advice"/)
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
