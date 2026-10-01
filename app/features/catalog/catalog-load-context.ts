import { Session } from 'remix/session'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs } from '../../lib/gist.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import type { SessionData } from '../../lib/session.ts'
import {
	getLayoutSession,
	getSessionData,
	sessionHasDataRepo,
} from '../../lib/session.ts'
import type { CatalogEntry } from './lib.ts'
import { fetchSharedCatalogSnapshot } from './lib.ts'

export type CatalogPageLoadContext = {
	catalogSnapshot: {
		entries: CatalogEntry[]
	}
	entries: EtfEntry[]
	session: ReturnType<typeof getSessionData>
	layoutSession: SessionData | null
}

export type CatalogEtfDetailLoadContext = {
	catalogSnapshot: CatalogPageLoadContext['catalogSnapshot']
	layoutSession: SessionData | null
}

/**
 * Catalog ETF detail page: shared catalog snapshot + session headers only (no holdings fetch).
 */
export async function loadCatalogEtfDetailContext(
	context: AppRequestContext,
): Promise<CatalogEtfDetailLoadContext> {
	const layoutSession = getLayoutSession(context.get(Session))
	const catalogSnapshot = await fetchSharedCatalogSnapshot(
		getSessionData(context.get(Session))?.token ?? null,
	)
	return { catalogSnapshot, layoutSession }
}

/**
 * Catalog list page: shared catalog snapshot + user holdings. A session pending
 * approval has no store to read, so it gets no holdings rather than an error.
 */
export async function loadCatalogPageContext(
	context: AppRequestContext,
): Promise<CatalogPageLoadContext> {
	const session = getSessionData(context.get(Session))
	const layoutSession = getLayoutSession(context.get(Session))
	const [catalogSnapshot, entries] = await Promise.all([
		fetchSharedCatalogSnapshot(session?.token ?? null),
		(async (): Promise<EtfEntry[]> => {
			if (!sessionHasDataRepo(session)) return []
			try {
				return await fetchEtfs(session.token, session.dataRepo)
			} catch {
				return []
			}
		})(),
	])
	return { catalogSnapshot, entries, session, layoutSession }
}

/**
 * Whether to offer catalog admin controls: a signed-in session whose sign-in
 * found push access to the catalog repo (`isAdmin`, set in `auth`). GitHub
 * still refuses the write itself for anyone without that access.
 */
export function isAdmin(params: {
	session: CatalogPageLoadContext['session']
	layoutSession: SessionData | null
}): boolean {
	const { session, layoutSession } = params
	return (
		session?.token !== null &&
		session?.token !== undefined &&
		layoutSession?.isAdmin === true
	)
}
