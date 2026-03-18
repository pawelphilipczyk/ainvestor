import type { RemixNode } from 'remix/component'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToStream } from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
import type { SessionData } from '../lib/session.ts'
import { DocumentShell } from './document-shell.tsx'

/**
 * Renders a page with the document shell and returns an HTML response.
 * Matches the Bookstore demo pattern: createHtmlResponse(renderToStream(...))
 */
export async function render(
	title: string,
	session: SessionData | null,
	currentPage: 'portfolio' | 'guidelines' | 'catalog',
	body: RemixNode,
	init?: ResponseInit,
): Promise<Response> {
	const document = jsx(DocumentShell, {
		title,
		session,
		currentPage,
		children: body,
	})

	return createHtmlResponse(renderToStream(document), init)
}
