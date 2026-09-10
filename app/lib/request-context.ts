import type { MiddlewareContext } from 'remix/router'
import type { appMiddleware } from '../router.ts'

/**
 * Request context produced by the app's global middleware chain.
 *
 * Derived from `appMiddleware` rather than hand-maintained: since rc.2 each
 * middleware carries its own context contribution in the type system, so the
 * chain itself is the source of truth for what `context.get(...)` can resolve.
 * Handlers defined outside `router.ts` should annotate their context with this.
 */
export type AppRequestContext = MiddlewareContext<typeof appMiddleware>
