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
 * DELETE THIS FILE when Remix makes `lockScroll` a public export again, or if
 * the mobile drawer is ever split from the desktop rail and moved onto a native
 * `<dialog>`.
 *
 * **Not** when the sidebar moves onto `remix/ui/popover` — Stage 6 tried that
 * and ruled it out. Measured in Chromium: `surface` always sets
 * `popover="manual"` (so the element is `display: none` until JS opens it, at
 * every breakpoint, while this sidebar is a persistent desktop rail that must
 * render from the server without JS), and on open it runs `anchor()`, which
 * writes `position: fixed; inset: <y>px auto auto <x>px` inline and so
 * overrides `inset-y-0 left-0`, turning the full-height drawer into a strip
 * under the toggle button. `surface` is a dropdown positioner, not a drawer.
 * `lockScroll` and `onOutsideClick` are not separately reachable either:
 * `@remix-run/ui`'s `popover` entry exports only `Context`, `anchor`,
 * `surface`, `focusOnShow` and `focusOnHide`. Reason 3 of the plan's decision
 * rule, with §6 of `docs/REMIX_RC_MIGRATION_PLAN.md` carrying the full
 * measurements.
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
