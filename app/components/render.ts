import type { RemixNode } from 'remix/component'
import { jsx } from 'remix/component/jsx-runtime'
import {
	type RenderToStreamOptions,
	renderToStream,
} from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
import type { AppPage } from '../lib/app-page.ts'
import type { SessionData } from '../lib/session.ts'
import { DocumentShell } from './document-shell.tsx'

export type RenderOptions = {
	title: string
	session: SessionData | null
	currentPage: AppPage
	body: RemixNode
	flashError?: string
	init?: ResponseInit
	/** When the document contains `<Frame>`, provide this so SSR can load nested frame HTML. */
	resolveFrame?: RenderToStreamOptions['resolveFrame']
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

	return createHtmlResponse(
		renderToStream(document, {
			...(options.resolveFrame ? { resolveFrame: options.resolveFrame } : {}),
		}),
		options.init,
	)
}
