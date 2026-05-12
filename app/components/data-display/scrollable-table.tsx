import type { Handle, RemixNode } from 'remix/ui'

function clipClassNames(extra?: string) {
	return `min-w-0 max-w-full overflow-hidden rounded-lg border border-border ${extra ?? ''}`.trim()
}

function scrollClassNames() {
	return 'min-w-0 overflow-x-auto'
}

function tableClassNames(extra?: string) {
	return `min-w-full w-max table-auto border-collapse ${extra ?? ''}`.trim()
}

/**
 * Horizontally scrollable table: **clip** wrapper (`min-w-0`, `overflow-hidden`)
 * bounds width for the flex/grid ancestor, inner **scroll** layer (`overflow-x-auto`)
 * holds the wide `<table>` (`min-w-full w-max table-auto`) — same pattern as the
 * catalog ETF tables inside a Frame.
 *
 * Props match `<table>` composition: use **`class`** (and other table attributes)
 * on this component; they are forwarded to the inner `<table>` after merging scroll
 * layout classes. Use **`wrapperClass`** for the outer clip (e.g. `mt-3`).
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
				data-scrollable-table-clip
				class={clipClassNames(
					typeof wrapperClass === 'string' ? wrapperClass : undefined,
				)}
			>
				<div data-scrollable-table-frame class={scrollClassNames()}>
					<table {...tableRest} class={tableClass}>
						{children}
					</table>
				</div>
			</div>
		)
	}
}
