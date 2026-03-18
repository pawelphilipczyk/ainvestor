import type { Handle } from '@remix-run/component'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { html } from 'remix/html-template'

/**
 * Matches Remix's function component shape from JSX.ElementType:
 * (handle: Handle<any>, setup: any) => (props: P) => RemixNode
 */
type RemixComponent<T extends object> = (
	handle: Handle<Record<string, never>>,
	setup: unknown,
) => (props: T) => unknown

/**
 * Renders a Remix JSX component to HTML. Use for form fields and other
 * server-rendered components.
 */
export async function renderJsx<T extends object>(
	component: RemixComponent<T>,
	props: T,
) {
	const markup = await renderToString(jsx(component, props))
	return html.raw`${markup}`
}
