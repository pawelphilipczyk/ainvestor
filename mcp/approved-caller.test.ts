import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { APPROVED_GITHUB_LOGINS } from '../app/lib/approved-github-logins.ts'
import {
	callerIsApproved,
	resetApprovedCallerCache,
} from './approved-caller.ts'

const APPROVED_LOGIN = APPROVED_GITHUB_LOGINS[0] ?? 'approved-login'
const originalFetch = globalThis.fetch
const originalEnvAllowlist = process.env.APPROVED_GITHUB_LOGINS

afterEach(() => {
	globalThis.fetch = originalFetch
	resetApprovedCallerCache()
	if (originalEnvAllowlist === undefined) {
		delete process.env.APPROVED_GITHUB_LOGINS
	} else {
		process.env.APPROVED_GITHUB_LOGINS = originalEnvAllowlist
	}
})

/** Answers `GET /user` as GitHub would, counting how often it is asked. */
function stubGithubUser(answer: () => Response): { calls: number } {
	const counter = { calls: 0 }
	globalThis.fetch = async () => {
		counter.calls += 1
		return answer()
	}
	return counter
}

describe('approved caller', () => {
	it('approves a token whose login is on the allowlist', async () => {
		stubGithubUser(() => Response.json({ login: APPROVED_LOGIN }))
		assert.equal(await callerIsApproved('token'), true)
	})

	it('matches the login case-insensitively, as GitHub logins are', async () => {
		stubGithubUser(() => Response.json({ login: APPROVED_LOGIN.toUpperCase() }))
		assert.equal(await callerIsApproved('token'), true)
	})

	it('refuses a login that is not on the allowlist', async () => {
		stubGithubUser(() => Response.json({ login: 'someone-else' }))
		assert.equal(await callerIsApproved('token'), false)
	})

	it('asks GitHub once per token, not once per request', async () => {
		const github = stubGithubUser(() =>
			Response.json({ login: APPROVED_LOGIN }),
		)
		await callerIsApproved('token')
		await callerIsApproved('token')
		assert.equal(github.calls, 1)
	})

	it('resolves each token separately, never reusing another token verdict', async () => {
		let login = APPROVED_LOGIN
		stubGithubUser(() => Response.json({ login }))

		assert.equal(await callerIsApproved('approved-token'), true)
		login = 'someone-else'
		assert.equal(await callerIsApproved('other-token'), false)
	})

	it('does not cache a failed lookup, so a GitHub hiccup is not a lockout', async () => {
		let failing = true
		const github = stubGithubUser(() =>
			failing
				? new Response('boom', { status: 500 })
				: Response.json({ login: APPROVED_LOGIN }),
		)

		assert.equal(await callerIsApproved('token'), false)
		failing = false
		assert.equal(await callerIsApproved('token'), true)
		assert.equal(github.calls, 2)
	})

	it('refuses an answer with no usable login', async () => {
		stubGithubUser(() => Response.json({ message: 'Bad credentials' }))
		assert.equal(await callerIsApproved('token'), false)
	})
})
