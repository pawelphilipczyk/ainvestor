/**
 * Document scroll lock for the mobile sidebar overlay.
 *
 * Verbatim copy of `@remix-run/ui@0.9.0`'s internal
 * `dist/popover/scroll-lock.js` (only reformatted to this repo's style). The
 * module exists on disk but is not reachable: the package's `exports` map does
 * not expose it, and `remix/ui/popover` — which does export `Context`,
 * `anchor`, `surface`, `focusOnShow` and `focusOnHide` — does not re-export
 * `lockScroll`. The old `remix/ui/scroll-lock` subpath was removed in the
 * beta.0 -> rc.2 jump and now fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 *
 * @see https://github.com/remix-run/remix/blob/main/packages/ui/CHANGELOG.md
 * @see https://github.com/remix-run/remix/tree/main/packages/ui
 *
 * DELETE THIS FILE when the sidebar is restructured onto `remix/ui/popover`'s
 * `surface` mixin, which calls `lockScroll()` internally and also covers
 * outside-click dismissal and focus restore (Stage 6 of
 * `docs/REMIX_RC_MIGRATION_PLAN.md`) — or sooner, if Remix makes `lockScroll`
 * a public export again. Vendored rather than adopted here under reason 3 of
 * that plan's decision rule: `surface` is an open/close mixin whose model the
 * sidebar's current toggle logic does not fit without the restructuring that
 * Stage 6 owns, and Stage 4 is only meant to unblock.
 *
 * Locks are reference counted per document, so nested or repeated locks release
 * the document only once the last holder releases.
 */

/** @type {WeakMap<Document, { count: number, documentOverflow: string, documentScrollbarGutter: string, scrollX: number, scrollY: number }>} */
const scrollLocks = new WeakMap()

/**
 * Locks scrolling on the given document.
 *
 * @param {Document} [targetDocument] Document to lock. Defaults to `globalThis.document`.
 * @returns {() => void} Releases this hold on the lock. Safe to call more than once.
 */
export function lockScroll(targetDocument = globalThis.document) {
	if (!targetDocument?.body || !targetDocument.defaultView) {
		return () => {}
	}
	const document = targetDocument
	const documentElement = document.documentElement
	const view = document.defaultView
	let state = scrollLocks.get(document)
	if (!state) {
		const scrollX = view.scrollX
		const scrollY = view.scrollY
		const scrollbarWidth =
			documentElement.clientWidth > 0
				? Math.max(view.innerWidth - documentElement.clientWidth, 0)
				: 0
		const computedScrollbarGutter =
			view.getComputedStyle(documentElement).scrollbarGutter
		state = {
			count: 0,
			documentOverflow: documentElement.style.overflow,
			documentScrollbarGutter: documentElement.style.scrollbarGutter,
			scrollX,
			scrollY,
		}
		documentElement.style.overflow = 'hidden'
		if (scrollbarWidth > 0 && computedScrollbarGutter === 'auto') {
			documentElement.style.scrollbarGutter = 'stable'
		}
		scrollLocks.set(document, state)
	}
	state.count++
	let unlocked = false
	return () => {
		if (unlocked) return
		unlocked = true
		const currentState = scrollLocks.get(document)
		if (!currentState) return
		currentState.count--
		if (currentState.count > 0) return
		scrollLocks.delete(document)
		documentElement.style.overflow = currentState.documentOverflow
		documentElement.style.scrollbarGutter = currentState.documentScrollbarGutter
		view.scrollTo(currentState.scrollX, currentState.scrollY)
	}
}
