import { createRouter } from 'remix/fetch-router'
import { formData } from 'remix/form-data-middleware'
import { logger } from 'remix/logger-middleware'
import { methodOverride } from 'remix/method-override-middleware'
import { session } from 'remix/session-middleware'
import { staticFiles } from 'remix/static-middleware'
import { adviceHandler, setAdviceClient } from './features/advice/index.ts'
import { authController } from './features/auth/index.ts'
import {
	catalogController,
	resetGuestCatalog,
} from './features/catalog/index.ts'
import {
	guidelinesController,
	resetGuestGuidelines,
} from './features/guidelines/index.ts'
import {
	portfolioController,
	resetEtfEntries,
} from './features/portfolio/index.ts'
import { sessionCookie, sessionStorage } from './lib/session.ts'
import { routes } from './routes.ts'

export {
	resetEtfEntries,
	resetGuestCatalog,
	resetGuestGuidelines,
	setAdviceClient,
}

const islands = staticFiles('app', {
	filter: (path) => path.endsWith('.island.js'),
})

export const router = createRouter({
	middleware:
		process.env.NODE_ENV === 'development'
			? [islands, logger(), formData(), methodOverride(), session(sessionCookie, sessionStorage)]
			: [islands, formData(), methodOverride(), session(sessionCookie, sessionStorage)],
})

router.get(routes.health, () => {
	return new Response('ok', {
		headers: { 'content-type': 'text/plain; charset=utf-8' },
	})
})

router.map(routes.portfolio, portfolioController)
router.map(routes.auth, authController)
router.map(routes.guidelines, guidelinesController)
router.map(routes.catalog, catalogController)
router.post(routes.advice, adviceHandler)
