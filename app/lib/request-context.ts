import type { MergeContext, RequestContext } from 'remix/fetch-router'
import type { Session } from 'remix/session'

/**
 * Request context after global `formData()` and `session()` middleware.
 * Handlers should use this instead of bare `RequestContext` so `get(FormData)` and `get(Session)` type-check.
 */
export type AppRequestContext = MergeContext<
	MergeContext<RequestContext, readonly [readonly [typeof FormData, FormData]]>,
	readonly [readonly [typeof Session, Session]]
>
