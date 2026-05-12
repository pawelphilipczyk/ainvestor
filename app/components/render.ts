import { createHtmlResponse } from 'remix/response/html'
import type { RemixNode } from 'remix/ui'
import { jsx } from 'remix/ui/jsx-runtime'
import type { RenderToStreamOptions } from 'remix/ui/server'
import { renderToStream } from 'remix/ui/server'
import type { AppPage } from '../lib/app-page.ts'
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
	resolveFrame?: RenderToStreamOptions['resolveFrame']
}

/**
 * Renders a page with the document shell and returns an HTML response.
 * Matches the Bookstore demo pattern: createHtmlResponse(renderToStream(...))
 */
export async function render(options: RenderOptions): Promise<Response> {
	const document = jsx(DocumentShell, {
		title: options.title,
		htmlLang: options.htmlLang,
		session: options.session,
		currentPage: options.currentPage,
		flashBanner: options.flashBanner,
		children: options.body,
	})

	const streamOptions: RenderToStreamOptions | undefined = options.resolveFrame
		? { resolveFrame: options.resolveFrame }
		: undefined

	const mergedHeaders = new Headers(options.init?.headers)
	if (options.responseHeaders !== undefined) {
		new Headers(options.responseHeaders).forEach((value, key) => {
			mergedHeaders.set(key, value)
		})
	}

	return createHtmlResponse(renderToStream(document, streamOptions), {
		...options.init,
		headers: mergedHeaders,
	})
}
