import type { Session } from 'remix/session'

import type { CatalogEntry } from '../features/catalog/lib.ts'
import type { EtfEntry } from './gist.ts'
import type { EtfGuideline } from './guidelines.ts'

const KEY = 'guestState'

type GuestState = {
	etfs: EtfEntry[]
	catalog: CatalogEntry[]
	guidelines: EtfGuideline[]
}

function emptyState(): GuestState {
	return { etfs: [], catalog: [], guidelines: [] }
}

function readState(session: Session): GuestState {
	const raw = session.get(KEY) as string | undefined
	if (!raw) return emptyState()
	try {
		const v = JSON.parse(raw) as Partial<GuestState>
		return {
			etfs: Array.isArray(v.etfs) ? v.etfs : [],
			catalog: Array.isArray(v.catalog) ? v.catalog : [],
			guidelines: Array.isArray(v.guidelines) ? v.guidelines : [],
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
	return readState(session).guidelines
}

export function setGuestGuidelines(
	session: Session,
	guidelines: EtfGuideline[],
): void {
	const s = readState(session)
	s.guidelines = guidelines
	writeState(session, s)
}
