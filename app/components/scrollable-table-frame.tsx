import type { Handle, RemixNode } from 'remix/component'

/**
 * Outer frame: sits in flex/grid layouts with min-w-0 so horizontal scroll works.
 * Inner table should use {@link getScrollableTableClassNames} (min-w-full w-max).
 */
export function getScrollableTableFrameClassNames(extra?: string) {
	return `min-w-0 max-w-full overflow-x-auto rounded-lg border border-border ${extra ?? ''}`.trim()
}

/**
 * Table classes so the table is at least as wide as the frame but can grow with
 * content — required for overflow-x-auto on the parent to show a horizontal scrollbar.
 */
export function getScrollableTableClassNames(extra?: string) {
	return `min-w-full w-max table-auto border-collapse ${extra ?? ''}`.trim()
}

/**
 * Wraps a wide `<table>` so it scrolls horizontally on narrow viewports instead of
 * stretching the page.
 */
export function ScrollableTableFrame(_handle: Handle, _setup?: unknown) {
	return (props: { class?: string; children?: RemixNode }) => (
		<div
			data-scrollable-table-frame
			class={getScrollableTableFrameClassNames(props.class)}
		>
			{props.children}
		</div>
	)
}
