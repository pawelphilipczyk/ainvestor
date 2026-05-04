import type { RemixNode } from 'remix/component'
import { jsx } from 'remix/component/jsx-runtime'
import type { RenderToStreamOptions } from 'remix/component/server'
import { renderToStream } from 'remix/component/server'
import { createHtmlResponse } from 'remix/response/html'
import { CatalogEtfAnalysisFragment } from '../features/catalog/catalog-etf-analysis-fragment.tsx'
import {
	buildCatalogEtfDetailOverlayForSearchParam,
	samePathAndSearch,
} from '../features/catalog/catalog-etf-overlay-build.ts'
import {
	CatalogEtfModalBodyFragment,
	type CatalogEtfModalBodyFragmentProps,
} from '../features/catalog/catalog-etf-modal-body-fragment.tsx'
import { parseEtfDetailSearchParam } from '../features/catalog/catalog-etf-search-param.ts'
import { fetchSharedCatalogSnapshot } from '../features/catalog/lib.ts'
import type { AppPage } from '../lib/app-page.ts'
import { appShellEtfCloseHref } from '../lib/app-shell-etf-modal.ts'
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
	/**
	 * When set, `?etf=` opens the global ETF detail modal for any page.
	 * Pass `context.request.url` from route handlers that render full HTML documents.
	 */
	requestUrl?: string
}

/**
 * Renders a page with the document shell and returns an HTML response.
 * Matches the Bookstore demo pattern: createHtmlResponse(renderToStream(...))
 */
export async function render(options: RenderOptions): Promise<Response> {
	let etfOverlay: ReturnType<typeof jsx> | null = null
	let etfOverlayAnalysisFrameSrc: string | null = null
	let etfModalBodyFrameResolve: {
		frameSrc: string
		props: CatalogEtfModalBodyFragmentProps
	} | null = null
	let etfModalTitle: string | null = null

	if (options.requestUrl !== undefined) {
		const etfId = parseEtfDetailSearchParam(options.requestUrl)
		if (etfId !== null) {
			const pendingApproval = options.session?.approvalStatus === 'pending'
			const catalogSnapshot = await fetchSharedCatalogSnapshot()
			const closeHref = appShellEtfCloseHref(options.requestUrl)
			const built = buildCatalogEtfDetailOverlayForSearchParam({
				requestUrl: options.requestUrl,
				catalog: catalogSnapshot.entries,
				pendingApproval,
				closeHref,
			})
			etfOverlay = built.overlay
			etfOverlayAnalysisFrameSrc = built.analysisFrameSrc
			etfModalBodyFrameResolve = built.modalBodyFrameResolve
			etfModalTitle = built.titleWhenOpen
		}
	}

	const mergedResolveFrame: RenderToStreamOptions['resolveFrame'] | undefined =
		options.resolveFrame !== undefined ||
		etfOverlayAnalysisFrameSrc !== null ||
		etfModalBodyFrameResolve !== null
			? (source) => {
					const fromRoute =
						options.resolveFrame !== undefined
							? options.resolveFrame(source)
							: ''
					if (fromRoute !== '') return fromRoute
					if (
						etfModalBodyFrameResolve !== null &&
						samePathAndSearch(source, etfModalBodyFrameResolve.frameSrc)
					) {
						return renderToStream(
							jsx(CatalogEtfModalBodyFragment, etfModalBodyFrameResolve.props),
						)
					}
					if (
						etfOverlayAnalysisFrameSrc !== null &&
						samePathAndSearch(source, etfOverlayAnalysisFrameSrc)
					) {
						return renderToStream(jsx(CatalogEtfAnalysisFragment, {}))
					}
					return ''
				}
			: undefined

	const document = jsx(DocumentShell, {
		title: etfModalTitle ?? options.title,
		htmlLang: options.htmlLang,
		session: options.session,
		currentPage: options.currentPage,
		flashBanner: options.flashBanner,
		etfOverlay,
		children: options.body,
	})

	const streamOptions: RenderToStreamOptions | undefined = mergedResolveFrame
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
