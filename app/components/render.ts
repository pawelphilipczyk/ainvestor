import type { RemixNode } from 'remix/component'
import { Fragment } from 'remix/component'
import { jsx } from 'remix/component/jsx-runtime'
import type { RenderToStreamOptions } from 'remix/component/server'
import { renderToStream } from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
import {
	buildCatalogDetailOverlayForSearchParam,
	resolveCatalogDetailModalFrameLayer,
} from '../features/catalog/catalog-etf-overlay-build.ts'
import { parseEtfDetailSearchParam } from '../features/catalog/catalog-etf-search-param.ts'
import { fetchSharedCatalogSnapshot } from '../features/catalog/lib.ts'
import type { AppPage } from '../lib/app-page.ts'
import { appShellEtfCloseHref } from '../lib/app-shell-etf-modal.ts'
import { composeResolveFrame } from '../lib/compose-resolve-frame.ts'
import type { SessionData } from '../lib/session.ts'
import type { FlashedBanner } from '../lib/session-flash.ts'
import { OverlayNode } from './overlay-node.tsx'
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
	/**
	 * When set, `?etf=` may attach the shared catalog fund overlay + merged `resolveFrame`.
	 * Pass `context.request.url` from document handlers so pages do not implement overlay logic.
	 */
	requestUrl?: string
}

/**
 * Renders a page with the document shell and returns an HTML response.
 * Matches the Bookstore demo pattern: createHtmlResponse(renderToStream(...))
 */
export async function render(options: RenderOptions): Promise<Response> {
	let documentBody = options.body
	let documentTitle = options.title
	let mergedResolveFrame = options.resolveFrame

	if (options.requestUrl !== undefined) {
		const overlayEntryId = parseEtfDetailSearchParam(options.requestUrl)
		if (overlayEntryId !== null) {
			const catalogSnapshot = await fetchSharedCatalogSnapshot()
			const overlayBuild = buildCatalogDetailOverlayForSearchParam({
				requestUrl: options.requestUrl,
				catalog: catalogSnapshot.entries,
				pendingApproval: options.session?.approvalStatus === 'pending',
				closeHref: appShellEtfCloseHref(options.requestUrl),
			})
			documentBody = jsx(Fragment, {
				children: [
					options.body,
					jsx(OverlayNode, { node: overlayBuild.overlay }),
				],
			})
			documentTitle = overlayBuild.titleWhenOpen ?? options.title
			mergedResolveFrame = composeResolveFrame(
				options.resolveFrame,
				resolveCatalogDetailModalFrameLayer(overlayBuild),
			)
		}
	}

	const document = jsx(DocumentShell, {
		title: documentTitle,
		htmlLang: options.htmlLang,
		session: options.session,
		currentPage: options.currentPage,
		flashBanner: options.flashBanner,
		children: documentBody,
	})

	const streamOptions: RenderToStreamOptions | undefined =
		mergedResolveFrame !== undefined
			? { resolveFrame: mergedResolveFrame }
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
