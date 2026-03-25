import type { Session } from 'remix/session'

import type { CatalogEntry } from '../features/catalog/lib.ts'
import type { EtfEntry } from './gist.ts'
import type { EtfGuideline } from './guidelines.ts'

const KEY = 'guestState'
const GUIDELINES_REF_KEY = 'guestGuidelinesRef'

type GuestState = {
	etfs: EtfEntry[]
	catalog: CatalogEntry[]
}

/** Server-side guest guidelines (cookie holds only `guestGuidelinesRef`). */
const guidelinesByRef = new Map<string, EtfGuideline[]>()

export function clearGuestGuidelinesServerStore(): void {
	guidelinesByRef.clear()
}

function emptyState(): GuestState {
	return { etfs: [], catalog: [] }
}

function readState(session: Session): GuestState {
	const raw = session.get(KEY) as string | undefined
	if (!raw) return emptyState()
	try {
		const v = JSON.parse(raw) as Partial<GuestState>
		return {
			etfs: Array.isArray(v.etfs) ? v.etfs : [],
			catalog: Array.isArray(v.catalog) ? v.catalog : [],
		}
	} catch {
		return emptyState()
	}
}

function writeState(session: Session, state: GuestState): void {
	session.set(KEY, JSON.stringify(state))
}

export function getGuestEtfs(session: Session): EtfEntry[] {
	return readState(session).etfs
}

export function setGuestEtfs(session: Session, etfs: EtfEntry[]): void {
	const s = readState(session)
	s.etfs = etfs
	writeState(session, s)
}

export function getGuestCatalog(session: Session): CatalogEntry[] {
	return readState(session).catalog
}

export function setGuestCatalog(
	session: Session,
	catalog: CatalogEntry[],
): void {
	const s = readState(session)
	s.catalog = catalog
	writeState(session, s)
}

export function getGuestGuidelines(session: Session): EtfGuideline[] {
	const ref = session.get(GUIDELINES_REF_KEY) as string | undefined
	if (!ref) return []
	return guidelinesByRef.get(ref) ?? []
}

export function setGuestGuidelines(
	session: Session,
	guidelines: EtfGuideline[],
): void {
	let ref = session.get(GUIDELINES_REF_KEY) as string | undefined
	if (!ref) {
		ref = `g_${crypto.randomUUID()}`
		session.set(GUIDELINES_REF_KEY, ref)
	}
	guidelinesByRef.set(ref, guidelines)
}
