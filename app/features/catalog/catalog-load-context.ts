import { Session } from 'remix/session'
import type { EtfEntry } from '../../lib/gist.ts'
import { fetchEtfs } from '../../lib/gist.ts'
import { getGuestEtfs } from '../../lib/guest-session-state.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import type { SessionData } from '../../lib/session.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import type { CatalogEntry } from './lib.ts'
import { fetchSharedCatalogSnapshot, isSharedCatalogAdmin } from './lib.ts'

export type CatalogPageLoadContext = {
	catalogSnapshot: {
		entries: CatalogEntry[]
		ownerLogin: string | null
	}
	entries: EtfEntry[]
	session: ReturnType<typeof getSessionData>
	layoutSession: SessionData | null
}

/**
 * Shared data for catalog list and ETF detail: shared gist snapshot + user holdings (guest or gist).
 */
export async function loadCatalogPageContext(
	context: AppRequestContext,
): Promise<CatalogPageLoadContext> {
	const session = getSessionData(context.get(Session))
	const layoutSession = getLayoutSession(context.get(Session))
	const [catalogSnapshot, entries] = await Promise.all([
		fetchSharedCatalogSnapshot(),
		session?.gistId && session.token
			? fetchEtfs(session.token, session.gistId)
			: getGuestEtfs(context.get(Session)),
	])
	return { catalogSnapshot, entries, session, layoutSession }
}

export function catalogCanImport(params: {
	session: CatalogPageLoadContext['session']
	layoutSession: SessionData | null
	ownerLogin: string | null
}): boolean {
	const { session, layoutSession, ownerLogin } = params
	return (
		session?.token !== null &&
		session?.token !== undefined &&
		isSharedCatalogAdmin({
			sessionLogin: layoutSession?.login,
			ownerLogin,
		})
	)
}
