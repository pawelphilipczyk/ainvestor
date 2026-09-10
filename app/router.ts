import { compression } from 'remix/middleware/compression'
import { formData } from 'remix/middleware/form-data'
import { logger } from 'remix/middleware/logger'
import { methodOverride } from 'remix/middleware/method-override'
import { render } from 'remix/middleware/render'
import { session } from 'remix/middleware/session'
import { staticFiles } from 'remix/middleware/static'
import { createMiddleware, createRouter, type Middleware } from 'remix/router'
import { Session } from 'remix/session'
import { handleMcpHttpRequest } from '../mcp/http.ts'
import {
	buildAuthorizationServerMetadata,
	buildProtectedResourceMetadata,
	metadataResponse,
	resolvePublicOrigin,
	unknownOriginResponse,
} from '../mcp/oauth-metadata.ts'
import { adminController } from './features/admin/index.ts'
import { setAdviceClient } from './features/advice/advice-client.ts'
import { adviceController } from './features/advice/index.ts'
import { authController } from './features/auth/index.ts'
import {
	catalogController,
	resetGuestCatalog,
} from './features/catalog/index.ts'
import { guidelinesController } from './features/guidelines/index.ts'
import { homeController } from './features/intro/index.ts'
import { localeController } from './features/locale/index.ts'
import {
	portfolioController,
	resetEtfEntries,
} from './features/portfolio/index.ts'
import { stripGithubTokenIfUnapproved } from './lib/approved-users.ts'
import { multipartLimitFlashOnError } from './lib/multipart-limit-flash-middleware.ts'
import {
	MULTIPART_MAX_FILE_BYTES,
	MULTIPART_MAX_TOTAL_BYTES,
} from './lib/multipart-upload-limits.ts'
import { remixAssetServer } from './lib/remix-assets.ts'
import type { AppRequestContext } from './lib/request-context.ts'
import { sessionCookie, sessionStorage } from './lib/session.ts'
import { uiLocaleMiddleware } from './lib/ui-locale-middleware.ts'
import { routes } from './routes.ts'

export { resetEtfEntries, resetGuestCatalog, setAdviceClient }

const appStatic = staticFiles('app', {
	filter: (path) =>
		path.endsWith('.component.js') ||
		path === 'entry.js' ||
		path === 'lib/dialog-trigger.js' ||
		path === 'lib/event-listeners.js' ||
		path === 'lib/scroll-lock.js',
})

/** Serves `remix`'s browser runtime; see `app/lib/remix-assets.ts`. */
function remixAssets(): Middleware {
	return async (context, next) => {
		const response = await remixAssetServer.fetch(context.request)
		return response ?? next()
	}
}

/**
 * Drops a GitHub token from the session when its login is not approved.
 *
 * The handler is deliberately typed against the bare `Middleware` contract
 * rather than {@link AppRequestContext}: this middleware is a member of
 * `appMiddleware`, and `AppRequestContext` is derived from `appMiddleware`, so
 * annotating it with the derived type would be circular. It only needs to read
 * `Session`, which the loose context resolves via the context-key fallback.
 */
function enforceGithubApproval(): Middleware {
	return async (context, next) => {
		const session = context.get(Session)
		if (session) stripGithubTokenIfUnapproved(session)
		return next()
	}
}

/**
 * The global middleware chain, in run order.
 *
 * One unconditional tuple for every environment. Since rc.2 each middleware
 * contributes its own entry to the request-context type, so a dev/prod ternary
 * would yield two different context types and the router would reject the
 * union. Running `compression()` in development and `logger()` in production is
 * the accepted cost; tune each middleware's options rather than reintroducing a
 * conditional chain.
 */
export const appMiddleware = createMiddleware(
	appStatic,
	remixAssets(),
	compression(),
	logger(),
	uiLocaleMiddleware(),
	session(sessionCookie, sessionStorage),
	multipartLimitFlashOnError(),
	formData({
		maxFileSize: MULTIPART_MAX_FILE_BYTES,
		maxTotalSize: MULTIPART_MAX_TOTAL_BYTES,
	}),
	methodOverride(),
	enforceGithubApproval(),
	render(),
)

export const router = createRouter({ middleware: appMiddleware })

router.get(routes.health, () => {
	return new Response('ok', {
		headers: { 'content-type': 'text/plain; charset=utf-8' },
	})
})

// MCP endpoint. Credentials arrive per request, so this route deliberately
// ignores the session: it is reached by Claude's servers, not by a browser.
router.post(routes.mcp.call, (context) => handleMcpHttpRequest(context.request))
router.get(routes.mcp.stream, (context) =>
	handleMcpHttpRequest(context.request),
)

/** Serves one discovery document, refusing when the origin cannot be trusted. */
function discoveryMetadata(
	build: (origin: string) => object,
): (context: AppRequestContext) => Response {
	return (context) => {
		const origin = resolvePublicOrigin(context.request)
		if (origin === null) return unknownOriginResponse()
		return metadataResponse(build(origin))
	}
}

const protectedResourceMetadata = discoveryMetadata(
	buildProtectedResourceMetadata,
)

router.get(routes.mcp.protectedResource, protectedResourceMetadata)
router.get(routes.mcp.protectedResourceForEndpoint, protectedResourceMetadata)
router.get(
	routes.mcp.authorizationServer,
	discoveryMetadata(buildAuthorizationServerMetadata),
)

router.map(routes.home, homeController)
router.map(routes.portfolio, portfolioController)
router.map(routes.locale, localeController)
router.map(routes.auth, authController)
router.map(routes.guidelines, guidelinesController)
router.map(routes.catalog, catalogController)
router.map(routes.advice, adviceController)
router.map(routes.admin, adminController)
