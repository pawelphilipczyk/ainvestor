import type { Session } from 'remix/session'

import type { AdviceDocument } from '../features/advice/advice-document.ts'
import type { AdviceModelId } from '../features/advice/advice-openai.ts'
import type { CatalogEntry } from '../features/catalog/lib.ts'
import type { EtfEntry } from './gist.ts'
import type { EtfGuideline } from './guidelines.ts'

const KEY = 'guestState'
const GUIDELINES_REF_KEY = 'guestGuidelinesRef'

export type GuestPortfolioReview = {
	advice: AdviceDocument
	model: AdviceModelId
}

type GuestState = {
	etfs: EtfEntry[]
	catalog: CatalogEntry[]
	portfolioReview?: GuestPortfolioReview | null
}

/** Server-side guest guidelines (cookie holds only `guestGuidelinesRef`). */
const MAX_GUEST_GUIDELINE_REFS = 2000

/** LRU by insertion order: get/set moves key to the end; evict from the front when full. */
const guidelinesByRef = new Map<string, EtfGuideline[]>()

function guidelinesCacheGet(ref: string): EtfGuideline[] | undefined {
	const rows = guidelinesByRef.get(ref)
	if (rows === undefined) return undefined
	guidelinesByRef.delete(ref)
	guidelinesByRef.set(ref, rows)
	return rows
}

function guidelinesCacheSet(ref: string, guidelines: EtfGuideline[]): void {
	if (guidelinesByRef.has(ref)) {
		guidelinesByRef.delete(ref)
	} else if (guidelinesByRef.size >= MAX_GUEST_GUIDELINE_REFS) {
		const first = guidelinesByRef.keys().next()
		if (!first.done && first.value !== undefined) {
			guidelinesByRef.delete(first.value)
		}
	}
	guidelinesByRef.set(ref, guidelines)
}

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
		const partial = JSON.parse(raw) as Partial<GuestState>
		const portfolioReview =
			partial.portfolioReview === null
				? null
				: partial.portfolioReview !== undefined &&
						typeof partial.portfolioReview === 'object' &&
						partial.portfolioReview !== null &&
						'advice' in partial.portfolioReview
					? (partial.portfolioReview as GuestPortfolioReview)
					: undefined
		return {
			etfs: Array.isArray(partial.etfs) ? partial.etfs : [],
			catalog: Array.isArray(partial.catalog) ? partial.catalog : [],
			...(portfolioReview !== undefined ? { portfolioReview } : {}),
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
	const state = readState(session)
	state.etfs = etfs
	writeState(session, state)
}

export function getGuestCatalog(session: Session): CatalogEntry[] {
	return readState(session).catalog
}

export function setGuestCatalog(
	session: Session,
	catalog: CatalogEntry[],
): void {
	const state = readState(session)
	state.catalog = catalog
	writeState(session, state)
}

export function getGuestGuidelines(session: Session): EtfGuideline[] {
	const ref = session.get(GUIDELINES_REF_KEY) as string | undefined
	if (!ref) return []
	return guidelinesCacheGet(ref) ?? []
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
	guidelinesCacheSet(ref, guidelines)
}

export function getGuestPortfolioReview(
	session: Session,
): GuestPortfolioReview | null {
	const stored = readState(session).portfolioReview
	if (stored === null || stored === undefined) return null
	return stored
}

export function setGuestPortfolioReview(
	session: Session,
	stored: GuestPortfolioReview,
): void {
	const state = readState(session)
	state.portfolioReview = stored
	writeState(session, state)
}

export function clearGuestPortfolioReview(session: Session): void {
	const state = readState(session)
	state.portfolioReview = null
	writeState(session, state)
}
