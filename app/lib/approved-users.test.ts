import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { createSession } from 'remix/session'

import {
	isGithubLoginApprovalEnforced,
	isGithubLoginApproved,
	parseApprovedGithubLogins,
	stripGithubTokenIfUnapproved,
} from './approved-users.ts'

afterEach(() => {
	delete process.env.APPROVED_GITHUB_LOGINS
})

describe('approved-users', () => {
	it('parseApprovedGithubLogins returns null when env is unset or blank', () => {
		delete process.env.APPROVED_GITHUB_LOGINS
		assert.equal(parseApprovedGithubLogins(), null)
		process.env.APPROVED_GITHUB_LOGINS = '   '
		assert.equal(parseApprovedGithubLogins(), null)
	})

	it('parseApprovedGithubLogins normalizes to lowercase and splits on comma/whitespace', () => {
		process.env.APPROVED_GITHUB_LOGINS = 'Alice, BOB\tcarol'
		const set = parseApprovedGithubLogins()
		assert.ok(set)
		assert.ok(set.has('alice'))
		assert.ok(set.has('bob'))
		assert.ok(set.has('carol'))
	})

	it('isGithubLoginApproved allows any login when allowlist is off', () => {
		delete process.env.APPROVED_GITHUB_LOGINS
		assert.equal(isGithubLoginApproved('Anyone'), true)
	})

	it('isGithubLoginApproved is case-insensitive when allowlist is on', () => {
		process.env.APPROVED_GITHUB_LOGINS = 'OctoCat'
		assert.equal(isGithubLoginApproved('octocat'), true)
		assert.equal(isGithubLoginApproved('other'), false)
	})

	it('stripGithubTokenIfUnapproved removes token when allowlist rejects login', () => {
		process.env.APPROVED_GITHUB_LOGINS = 'alice'
		const session = createSession()
		session.set('login', 'bob')
		session.set('token', 'secret')
		session.set('gistId', 'gist1')
		stripGithubTokenIfUnapproved(session)
		assert.equal(session.get('token'), undefined)
		assert.equal(session.get('gistId'), undefined)
		assert.equal(session.get('approvalStatus'), 'pending')
	})

	it('stripGithubTokenIfUnapproved leaves session when login is allowed', () => {
		process.env.APPROVED_GITHUB_LOGINS = 'alice'
		const session = createSession()
		session.set('login', 'alice')
		session.set('token', 'secret')
		session.set('gistId', 'gist1')
		stripGithubTokenIfUnapproved(session)
		assert.equal(session.get('token'), 'secret')
		assert.equal(session.get('gistId'), 'gist1')
	})

	it('isGithubLoginApprovalEnforced reflects non-empty allowlist', () => {
		delete process.env.APPROVED_GITHUB_LOGINS
		assert.equal(isGithubLoginApprovalEnforced(), false)
		process.env.APPROVED_GITHUB_LOGINS = 'x'
		assert.equal(isGithubLoginApprovalEnforced(), true)
	})
})
