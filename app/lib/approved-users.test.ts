import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { createSession } from 'remix/session'
import { APPROVED_GITHUB_LOGINS } from './approved-github-logins.ts'
import {
	approvedGithubLoginSet,
	getApprovedGithubLoginsSet,
	isGithubLoginApproved,
	stripGithubTokenIfUnapproved,
} from './approved-users.ts'

afterEach(() => {
	delete process.env.APPROVED_GITHUB_LOGINS
})

describe('approved-users', () => {
	it('APPROVED_GITHUB_LOGINS export is a string array', () => {
		assert.ok(Array.isArray(APPROVED_GITHUB_LOGINS))
		for (const login of APPROVED_GITHUB_LOGINS) {
			assert.equal(typeof login, 'string')
		}
	})

	it('approvedGithubLoginSet returns empty set for empty or whitespace-only entries', () => {
		assert.equal(approvedGithubLoginSet([]).size, 0)
		assert.equal(approvedGithubLoginSet(['', '  ', '\t']).size, 0)
	})

	it('approvedGithubLoginSet normalizes to lowercase and trims', () => {
		const set = approvedGithubLoginSet(['Alice', ' BOB '])
		assert.ok(set.has('alice'))
		assert.ok(set.has('bob'))
	})

	it('getApprovedGithubLoginsSet merges env entries with file list', () => {
		process.env.APPROVED_GITHUB_LOGINS = 'Alice, BOB\tcarol'
		const set = getApprovedGithubLoginsSet()
		assert.ok(set.has('alice'))
		assert.ok(set.has('bob'))
		assert.ok(set.has('carol'))
	})

	it('rejects every login when file and env lists are empty', () => {
		delete process.env.APPROVED_GITHUB_LOGINS
		assert.equal(getApprovedGithubLoginsSet().size, 0)
		assert.equal(isGithubLoginApproved('Anyone'), false)
	})

	it('isGithubLoginApproved is case-insensitive when allowlist has entries', () => {
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

	it('stripGithubTokenIfUnapproved clears token when merged allowlist is empty', () => {
		delete process.env.APPROVED_GITHUB_LOGINS
		const session = createSession()
		session.set('login', 'anyone')
		session.set('token', 'secret')
		session.set('gistId', 'gist1')
		stripGithubTokenIfUnapproved(session)
		assert.equal(session.get('token'), undefined)
		assert.equal(session.get('gistId'), undefined)
		assert.equal(session.get('approvalStatus'), 'pending')
	})
})
