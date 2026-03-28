import type { Handle, RemixNode } from 'remix/component'

function frameClassNames(extra?: string) {
	return `min-w-0 max-w-full overflow-x-auto rounded-lg border border-border ${extra ?? ''}`.trim()
}

function tableClassNames(extra?: string) {
	return `min-w-full w-max table-auto border-collapse ${extra ?? ''}`.trim()
}

/**
 * Horizontally scrollable table: outer frame (`min-w-0`, `overflow-x-auto`) plus
 * inner `<table>` (`min-w-full w-max`) so wide content scrolls inside the card on
 * narrow viewports.
 */
export function ScrollableTable(_handle: Handle, _setup?: unknown) {
	return (props: {
		/** Extra classes on the scroll container (e.g. `mt-3`). */
		class?: string
		/** Extra classes on the `<table>` (e.g. `text-sm`). */
		tableClass?: string
		children?: RemixNode
	}) => (
		<div data-scrollable-table-frame class={frameClassNames(props.class)}>
			<table class={tableClassNames(props.tableClass)}>{props.children}</table>
		</div>
	)
}
