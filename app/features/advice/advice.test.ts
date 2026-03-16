import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { router } from '../../router.ts'
import type { AdviceClient } from '../../openai.ts'
import { resetEtfEntries } from '../portfolio/index.ts'
import { resetGuestGuidelines } from '../guidelines/index.ts'
import { setAdviceClient } from './index.ts'

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
  resetGuestGuidelines()
  setAdviceClient(null)
})

describe('Advice', () => {
  it('returns 400 when cashAmount is missing', async () => {
    setAdviceClient(makeMockClient('irrelevant'))

    const response = await router.fetch(
      new Request('http://localhost/advice', { method: 'POST', body: new FormData() }),
    )

    assert.equal(response.status, 400)
  })

  it('returns advice HTML from the LLM when cashAmount is provided', async () => {
    setAdviceClient(makeMockClient('Buy VTI for broad market exposure.'))

    const form = new FormData()
    form.set('cashAmount', '1000')

    const response = await router.fetch(
      new Request('http://localhost/advice', { method: 'POST', body: form }),
    )
    const body = await response.text()

    assert.equal(response.status, 200)
    assert.match(body, /Buy VTI for broad market exposure\./)
  })

  it('includes current ETF holdings in the advice context', async () => {
    let capturedUserMessage = ''
    setAdviceClient({
      chat: {
        completions: {
          create: async params => {
            capturedUserMessage = params.messages[1].content
            return { choices: [{ message: { content: 'advice' } }] }
          },
        },
      },
    })

    const addForm = new FormData()
    addForm.set('etfName', 'VXUS')
    addForm.set('value', '3000')
    addForm.set('currency', 'USD')
    await router.fetch(new Request('http://localhost/etfs', { method: 'POST', body: addForm }))

    const adviceForm = new FormData()
    adviceForm.set('cashAmount', '500')
    await router.fetch(new Request('http://localhost/advice', { method: 'POST', body: adviceForm }))

    assert.match(capturedUserMessage, /VXUS/)
    assert.match(capturedUserMessage, /3000 USD/)
    assert.match(capturedUserMessage, /\$500/)
  })

  it('passes guidelines into the advice prompt when they exist', async () => {
    let capturedUserMessage = ''
    setAdviceClient({
      chat: {
        completions: {
          create: async params => {
            capturedUserMessage = params.messages[1].content
            return { choices: [{ message: { content: 'advice' } }] }
          },
        },
      },
    })

    const guidelineForm = new FormData()
    guidelineForm.set('etfName', 'VTI')
    guidelineForm.set('targetPct', '60')
    guidelineForm.set('etfType', 'equity')
    await router.fetch(
      new Request('http://localhost/guidelines', { method: 'POST', body: guidelineForm }),
    )

    const adviceForm = new FormData()
    adviceForm.set('cashAmount', '1000')
    await router.fetch(new Request('http://localhost/advice', { method: 'POST', body: adviceForm }))

    assert.match(capturedUserMessage, /VTI.*60%/)
    assert.match(capturedUserMessage, /equity/)
  })
})
