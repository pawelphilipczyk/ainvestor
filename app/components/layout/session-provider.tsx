import type { Handle, RemixNode } from 'remix/ui'
import type { SessionData } from '../../lib/session.ts'

export type SessionContext = { session: SessionData | null }

type SessionProviderProps = {
	session: SessionData | null
	children: RemixNode
}

/**
 * Provides session via handle.context for descendant components.
 * Use handle.context.get(SessionProvider) to consume.
 */
export function SessionProvider(
	handle: Handle<SessionProviderProps, SessionContext>,
) {
	return () => {
		handle.context.set({ session: handle.props.session })
		return handle.props.children
	}
}
