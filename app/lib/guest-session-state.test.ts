import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { CatalogEntry } from '../features/catalog/lib.ts'
import {
	clearGuestGuidelinesServerStore,
	getGuestCatalog,
	getGuestEtfs,
	getGuestGuidelines,
	setGuestCatalog,
	setGuestEtfs,
	setGuestGuidelines,
} from './guest-session-state.ts'
import type { EtfGuideline } from './guidelines.ts'
import { sessionStorage } from './session.ts'

async function freshSession() {
	return sessionStorage.read(null)
}

const sampleCatalog: CatalogEntry[] = [
	{
		id: 'c1',
		ticker: 'VTI',
		name: 'Vanguard Total Stock',
		type: 'equity',
		description: '',
	},
]

const sampleGuideline: EtfGuideline = {
	id: 'g1',
	kind: 'instrument',
	etfName: 'VTI',
	targetPct: 60,
	etfType: 'equity',
}

describe('guest session state', () => {
	afterEach(() => {
		clearGuestGuidelinesServerStore()
	})

	it('returns empty state for a session that has never stored guest data', async () => {
		const session = await freshSession()
		assert.deepEqual(getGuestEtfs(session), [])
		assert.deepEqual(getGuestCatalog(session), [])
		assert.deepEqual(getGuestGuidelines(session), [])
	})

	it('round-trips guest ETFs and catalog through the same session', async () => {
		const session = await freshSession()
		setGuestEtfs(session, [
			{ id: 'e1', name: 'Vanguard Total Stock', value: 1000, currency: 'USD' },
		])
		setGuestCatalog(session, sampleCatalog)

		assert.deepEqual(getGuestEtfs(session), [
			{ id: 'e1', name: 'Vanguard Total Stock', value: 1000, currency: 'USD' },
		])
		assert.deepEqual(getGuestCatalog(session), sampleCatalog)
	})

	it('setting one guest field does not clobber the other already stored in the session', async () => {
		const session = await freshSession()
		setGuestCatalog(session, sampleCatalog)
		setGuestEtfs(session, [
			{ id: 'e1', name: 'Vanguard Total Stock', value: 1000, currency: 'USD' },
		])

		assert.deepEqual(getGuestCatalog(session), sampleCatalog)
		assert.equal(getGuestEtfs(session).length, 1)
	})

	it('falls back to empty state when the stored session value is corrupted JSON', async () => {
		const session = await freshSession()
		session.set('guestState', 'not valid json{')

		assert.deepEqual(getGuestEtfs(session), [])
		assert.deepEqual(getGuestCatalog(session), [])
	})

	it('round-trips guest guidelines via the session ref into the server-side cache', async () => {
		const session = await freshSession()
		setGuestGuidelines(session, [sampleGuideline])

		assert.deepEqual(getGuestGuidelines(session), [sampleGuideline])
	})

	it('reuses the same guidelines ref across repeated writes in one session', async () => {
		const session = await freshSession()
		setGuestGuidelines(session, [sampleGuideline])
		const refAfterFirstWrite = session.get('guestGuidelinesRef')

		setGuestGuidelines(session, [])
		assert.equal(session.get('guestGuidelinesRef'), refAfterFirstWrite)
		assert.deepEqual(getGuestGuidelines(session), [])
	})

	it('returns no guidelines once the server-side store has been cleared, even with a live ref', async () => {
		const session = await freshSession()
		setGuestGuidelines(session, [sampleGuideline])

		clearGuestGuidelinesServerStore()

		assert.deepEqual(getGuestGuidelines(session), [])
	})

	it('keeps guidelines isolated per session (distinct refs, distinct cache entries)', async () => {
		const sessionA = await freshSession()
		const sessionB = await freshSession()
		setGuestGuidelines(sessionA, [sampleGuideline])
		setGuestGuidelines(sessionB, [])

		assert.deepEqual(getGuestGuidelines(sessionA), [sampleGuideline])
		assert.deepEqual(getGuestGuidelines(sessionB), [])
	})
})
