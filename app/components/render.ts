import type { RemixNode } from 'remix/component'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToStream } from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
import type { SessionData } from '../lib/session.ts'
import { DocumentShell } from './document-shell.tsx'

export type RenderOptions = {
	title: string
	session: SessionData | null
	currentPage: 'portfolio' | 'guidelines' | 'catalog'
	body: RemixNode
	flashError?: string
	init?: ResponseInit
}

/**
 * Renders a page with the document shell and returns an HTML response.
 * Matches the Bookstore demo pattern: createHtmlResponse(renderToStream(...))
 */
export async function render(options: RenderOptions): Promise<Response> {
	const document = jsx(DocumentShell, {
		title: options.title,
		session: options.session,
		currentPage: options.currentPage,
		flashError: options.flashError,
		children: options.body,
	})

	return createHtmlResponse(renderToStream(document), options.init)
}
