import type { RemixNode } from 'remix/component'
import { createElement } from 'remix/component'
import { jsx } from 'remix/component/jsx-runtime'
import { renderToStream, renderToString } from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
// @ts-expect-error Runtime-only JS client entry module
import { CatalogPasteInteractions } from '../features/catalog/catalog-paste.component.js'
// @ts-expect-error Runtime-only JS client entry module
import { EtfCardInteractions } from '../features/portfolio/etf-card.component.js'
import type { SessionData } from '../lib/session.ts'
import { DocumentShell } from './document-shell.tsx'
// @ts-expect-error Runtime-only JS client entry module
import { SidebarInteractions } from './sidebar.component.js'
// @ts-expect-error Runtime-only JS client entry module
import { ThemeToggleInteractions } from './theme-toggle.component.js'

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
	const [
		sidebarInteractions,
		themeToggleInteractions,
		etfCardInteractions,
		catalogPasteInteractions,
	] = await Promise.all([
		renderToString(createElement(SidebarInteractions, {})),
		renderToString(createElement(ThemeToggleInteractions, {})),
		renderToString(createElement(EtfCardInteractions, {})),
		currentPage === 'catalog'
			? renderToString(createElement(CatalogPasteInteractions, {}))
			: '',
	])

	const document = jsx(DocumentShell, {
		title,
		session,
		currentPage,
		children: body,
		sidebarInteractions,
		themeToggleInteractions,
		etfCardInteractions,
		catalogPasteInteractions,
	})

	return createHtmlResponse(renderToStream(document), init)
}
