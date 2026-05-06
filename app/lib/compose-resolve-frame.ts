import type { RenderToStreamOptions } from 'remix/component/server'

type ResolveFrame = NonNullable<RenderToStreamOptions['resolveFrame']>

/**
 * Chain multiple `resolveFrame` implementations: each layer runs in order until one
 * returns non-empty streamed HTML. Use for combining route fragments with optional
 * overlay / dialog Frame streams.
 */
export function composeResolveFrame(
	...layers: Array<ResolveFrame | undefined>
): ResolveFrame | undefined {
	const defined = layers.filter(
		(layer): layer is ResolveFrame => layer !== undefined,
	)
	if (defined.length === 0) return undefined
	return (source) => {
		for (const layer of defined) {
			const streamed = layer(source)
			if (streamed !== '') return streamed
		}
		return ''
	}
}
