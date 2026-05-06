import type { Handle, RemixNode } from 'remix/component'

/** Renders an optional overlay node (e.g. `<dialog>`) next to page content without extra markup when `node` is null. */
export function OverlayNode(_handle: Handle, _setup?: unknown) {
	return (props: { node: RemixNode | null }) => props.node
}
