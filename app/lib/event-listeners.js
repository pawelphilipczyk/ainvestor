/**
 * Signal-scoped event listener registration.
 *
 * Vendored replacement for `addEventListeners`, which `@remix-run/ui` exported
 * up to 0.1.1 and **removed** in 0.9.0 — at 0.9.0 no public entry point exports
 * it or an equivalent. Ported from the upstream source of `@remix-run/ui@0.1.1`
 * (`src/runtime/event-listeners.ts`) so the runtime behavior is preserved
 * exactly; only the TypeScript generics are dropped, since this file is plain
 * JS outside `tsconfig.json`'s `include`.
 *
 * @see https://github.com/remix-run/remix/blob/main/packages/ui/CHANGELOG.md
 * @see https://github.com/remix-run/remix/tree/main/packages/ui
 *
 * DELETE THIS FILE when Remix re-exports an equivalent helper, or when every
 * call site has moved to a Remix primitive (Stage 6 of
 * `docs/REMIX_RC_MIGRATION_PLAN.md`). It is hand-rolled only under reason 3 of
 * that plan's decision rule: at 0.9.0 Remix ships no API for document-level
 * event delegation, so there is nothing to adopt yet.
 *
 * Re-entry: upstream hands a per-dispatch `AbortController` signal to any
 * handler that declares a second parameter, aborting the previous dispatch's
 * signal on each new event. Every current call site uses single-parameter
 * handlers, so that branch is inert today; it is kept so that a handler which
 * later declares the second parameter behaves as it did upstream.
 *
 * @param {EventTarget} target Event target to attach the listeners to.
 * @param {AbortSignal} signal Lifetime signal that removes all the listeners.
 * @param {Record<string, (event: Event, reentrySignal?: AbortSignal) => void>} listeners
 *   Listener map keyed by event type.
 */
export function addEventListeners(target, signal, listeners) {
	for (const [type, listener] of Object.entries(listeners)) {
		if (!listener) continue
		/** @type {AbortController | null} */
		let reentry = null

		signal.addEventListener('abort', () => {
			reentry?.abort()
		})

		target.addEventListener(
			type,
			(event) => {
				reentry?.abort()
				if (listener.length < 2) {
					reentry = null
					listener(event)
				} else {
					reentry = new AbortController()
					listener(event, reentry.signal)
				}
			},
			{ signal },
		)
	}
}
