/**
 * The events a listener map may name, and the event type each handler gets.
 *
 * Both maps, because call sites attach to `document` and to `window`:
 * `pageshow` lives only on `WindowEventMap`, while `submit` carries the
 * `SubmitEvent` (and so `event.submitter`) that a bare `Event` does not. That
 * distinction is not cosmetic — reading `.submitter` off an `Event` was a type
 * error this conversion surfaced.
 */
type BrowserEventMap = DocumentEventMap & WindowEventMap

/**
 * Signal-scoped event listener registration.
 *
 * Vendored replacement for `addEventListeners`, which `@remix-run/ui` exported
 * up to 0.1.1 and **removed** in 0.9.0 — at 0.9.0 no public entry point exports
 * it or an equivalent. Ported from the upstream source of `@remix-run/ui@0.1.1`
 * (`src/runtime/event-listeners.ts`) so the runtime behavior is preserved
 * exactly, types included — the note that once stood here, about generics
 * being dropped because the file was plain JS outside `tsconfig.json`, no
 * longer applies now that it is a typed browser module.
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
 * @param target Event target to attach the listeners to.
 * @param signal Lifetime signal that removes all the listeners.
 * @param listeners Listener map keyed by event type.
 */
export function addEventListeners(
	target: EventTarget,
	signal: AbortSignal,
	listeners: {
		[type in keyof BrowserEventMap]?: (
			event: BrowserEventMap[type],
			reentrySignal?: AbortSignal,
		) => void
	},
): void {
	for (const [type, listener] of Object.entries(listeners) as [
		string,
		((event: Event, reentrySignal?: AbortSignal) => void) | undefined,
	][]) {
		if (!listener) continue
		let reentry: AbortController | null = null

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
