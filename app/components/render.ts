import { jsx } from 'remix/component/jsx-runtime'
import { renderToString } from 'remix/component/server'
import { html } from 'remix/html-template'

type RemixComponent<T> = (
	_handle: unknown,
	_setup?: unknown,
) => (props: T) => JSX.Element

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
