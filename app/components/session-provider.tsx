import type { Handle, RemixNode } from 'remix/component'
import type { SessionData } from '../lib/session.ts'

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
	handle: Handle<SessionContext>,
	_setup?: unknown,
) {
	return (props: SessionProviderProps) => {
		handle.context.set({ session: props.session })
		return props.children
	}
}
