import type { Handle, RemixNode } from 'remix/ui'
import {
	busyControlLabelClass,
	busyControlOverlayClass,
	busyControlRootStateClasses,
	busyControlSpinnerClass,
} from '../forms/busy-control-overlay.ts'

type LinkProps = {
	href: string
	children: RemixNode
	/** Root classes on `<a>` (layout, colors, focus). */
	class?: string
	/** Optional classes on the label wrapper (e.g. flex + gap for icon + text). */
	labelClass?: string
	/**
	 * When true, adds `data-navigation-loading` for the client enhancement that
	 * sets `data-loading` + navigates. Remix does not ship a `Link` primitive;
	 * this is our app component for that pattern.
	 */
	navigationLoading?: boolean
}

/**
 * Anchor with optional full-page navigation loading UX (`data-navigation-loading`).
 * Remix `@remix-run/ui` exposes DOM `link` props for `<link>`, not a router `Link`.
 */
export function Link(handle: Handle<LinkProps>) {
	return () => {
		const {
			href,
			children,
			class: rootClass,
			labelClass,
			navigationLoading,
		} = handle.props
		if (navigationLoading === true) {
			const root = `${busyControlRootStateClasses} ${rootClass ?? ''}`.trim()
			const label = `${busyControlLabelClass} ${labelClass ?? ''}`.trim()
			return (
				<a href={href} data-navigation-loading rmx-document class={root}>
					<span class={label}>{children}</span>
					<span class={busyControlOverlayClass} aria-hidden="true">
						<span class={busyControlSpinnerClass} />
					</span>
				</a>
			)
		}
		return (
			<a href={href} rmx-document class={rootClass}>
				{children}
			</a>
		)
	}
}
