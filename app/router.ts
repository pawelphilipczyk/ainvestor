import { compression } from 'remix/compression-middleware'
import { createRouter, type Middleware } from 'remix/fetch-router'
import { formData } from 'remix/form-data-middleware'
import { logger } from 'remix/logger-middleware'
import { methodOverride } from 'remix/method-override-middleware'
import { Session } from 'remix/session'
import { session } from 'remix/session-middleware'
import { staticFiles } from 'remix/static-middleware'
import { adviceController, setAdviceClient } from './features/advice/index.ts'
import { authController } from './features/auth/index.ts'
import {
	catalogController,
	resetGuestCatalog,
} from './features/catalog/index.ts'
import { guidelinesController } from './features/guidelines/index.ts'
import { homeController } from './features/intro/index.ts'
import {
	portfolioController,
	resetEtfEntries,
} from './features/portfolio/index.ts'
import { stripGithubTokenIfUnapproved } from './lib/approved-users.ts'
import type { AppRequestContext } from './lib/request-context.ts'
import { sessionCookie, sessionStorage } from './lib/session.ts'
import { routes } from './routes.ts'

export { resetEtfEntries, resetGuestCatalog, setAdviceClient }

const appStatic = staticFiles('app', {
	filter: (path) =>
		path.endsWith('.component.js') ||
		path === 'entry.js' ||
		path === 'lib/dialog-trigger.js',
})

const remixRuntime = staticFiles('node_modules', {
	filter: (path) =>
		path === 'remix/dist/component.js' ||
		path.startsWith('@remix-run/component/dist/') ||
		path.startsWith('@remix-run/interaction/dist/'),
})

function enforceGithubApproval(): Middleware {
	const handler = async (
		context: AppRequestContext,
		next: () => Promise<Response>,
	) => {
		stripGithubTokenIfUnapproved(context.get(Session))
		return next()
	}
	return handler as unknown as Middleware
}

export const router = createRouter({
	middleware:
		process.env.NODE_ENV === 'development'
			? [
					appStatic,
					remixRuntime,
					logger(),
					formData(),
					methodOverride(),
					session(sessionCookie, sessionStorage),
					enforceGithubApproval(),
				]
			: [
					appStatic,
					remixRuntime,
					compression(),
					formData(),
					methodOverride(),
					session(sessionCookie, sessionStorage),
					enforceGithubApproval(),
				],
})

router.get(routes.health, () => {
	return new Response('ok', {
		headers: { 'content-type': 'text/plain; charset=utf-8' },
	})
})

router.map(routes.home, homeController)
router.map(routes.portfolio, portfolioController)
router.map(routes.auth, authController)
router.map(routes.guidelines, guidelinesController)
router.map(routes.catalog, catalogController)
router.map(routes.advice, adviceController)
