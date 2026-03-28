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
 *
 * Props match `<table>` composition: use **`class`** (and other table attributes)
 * on this component; they are forwarded to the inner `<table>` after merging scroll
 * layout classes. Use **`wrapperClass`** for the scroll container (e.g. `mt-3`).
 */
export function ScrollableTable(_handle: Handle, _setup?: unknown) {
	return (props: {
		wrapperClass?: string
		children?: RemixNode
		class?: string
		[key: string]: unknown
	}) => {
		const {
			wrapperClass,
			children,
			class: tableClassFromProps,
			...tableRest
		} = props
		const tableClass = tableClassNames(
			typeof tableClassFromProps === 'string' ? tableClassFromProps : undefined,
		)
		return (
			<div
				data-scrollable-table-frame
				class={frameClassNames(
					typeof wrapperClass === 'string' ? wrapperClass : undefined,
				)}
			>
				<table {...tableRest} class={tableClass}>
					{children}
				</table>
			</div>
		)
	}
}
