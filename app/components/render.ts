import { createHtmlResponse } from 'remix/response/html'
import type { RemixNode } from 'remix/ui'
import { jsx } from 'remix/ui/jsx-runtime'
import type { RenderToStreamOptions } from 'remix/ui/server'
import { renderToStream } from 'remix/ui/server'
import type { AppPage } from '../lib/app-page.ts'
import { resolveClientEntry } from '../lib/remix-assets.ts'
import type { AppRequestContext } from '../lib/request-context.ts'
import type { SessionData } from '../lib/session.ts'
import type { FlashedBanner } from '../lib/session-flash.ts'
import { DocumentShell } from './layout/document-shell.tsx'

export type RenderOptions = {
	title: string
	htmlLang: string
	session: SessionData | null
	currentPage: AppPage
	body: RemixNode
	flashBanner?: FlashedBanner
	init?: ResponseInit
	/** Merged into the response headers (e.g. client hints). */
	responseHeaders?: HeadersInit
	/**
	 * Renders a known `<Frame>` target inline from data this render already
	 * has, instead of the default fetch-based frame resolution — avoids
	 * recomputing something costly (advice/ETF analysis) via a second
	 * in-process request. `context.render`'s `RenderFunction` has no per-call
	 * hook for this, so pages that need it render through `renderToStream`
	 * directly instead of the `render()` middleware. (Reason 3.)
	 */
	resolveFrame?: RenderToStreamOptions['resolveFrame']
}

/**
 * Renders a `<Frame>` fragment to a stream.
 *
 * Use this instead of `renderToStream()` directly. Entry IDs are `file:` URLs
 * since the assets migration, so a bare `renderToStream()` resolves a client
 * entry through the renderer's default resolver and emits the *filesystem
 * path* as a script `src` — unfetchable, and a path leak. No fragment renders
 * a client entry today; this is what stops the first one that does from
 * shipping broken. Same reason `render()` below passes the resolver on its
 * `resolveFrame` branch.
 */
export function renderFragmentToStream(
	node: RemixNode,
): ReadableStream<Uint8Array> {
	return renderToStream(node, { resolveClientEntry })
}

/** Renders a page with the document shell and returns an HTML response. */
export async function render(
	context: AppRequestContext,
	options: RenderOptions,
): Promise<Response> {
	const document = jsx(DocumentShell, {
		title: options.title,
		htmlLang: options.htmlLang,
		session: options.session,
		currentPage: options.currentPage,
		flashBanner: options.flashBanner,
		children: options.body,
	})

	const mergedHeaders = new Headers(options.init?.headers)
	if (options.responseHeaders !== undefined) {
		new Headers(options.responseHeaders).forEach((value, key) => {
			mergedHeaders.set(key, value)
		})
	}
	const init: ResponseInit = { ...options.init, headers: mergedHeaders }

	if (options.resolveFrame) {
		return createHtmlResponse(
			renderToStream(document, {
				resolveFrame: options.resolveFrame,
				// The `render()` middleware wires this from its own `assets`
				// option; this branch bypasses the middleware, so it has to pass
				// the same resolver or the shell's client entries would be
				// emitted with their raw `file:` source paths as script `src`.
				resolveClientEntry,
				signal: context.request.signal,
			}),
			init,
		)
	}

	return context.render(document, init)
}
