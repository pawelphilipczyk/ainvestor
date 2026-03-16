import { createRouter } from 'remix/fetch-router'
import { formData } from 'remix/form-data-middleware'
import { logger } from 'remix/logger-middleware'

import { routes } from './routes.ts'
import { authController } from './features/auth/index.ts'
import {
	portfolioController,
	resetEtfEntries,
} from './features/portfolio/index.ts'
import {
	guidelinesController,
	resetGuestGuidelines,
} from './features/guidelines/index.ts'
import {
	catalogController,
	resetGuestCatalog,
} from './features/catalog/index.ts'
import { adviceHandler, setAdviceClient } from './features/advice/index.ts'

export {
	resetEtfEntries,
	resetGuestGuidelines,
	resetGuestCatalog,
	setAdviceClient,
}

export const router = createRouter({
	middleware:
		process.env.NODE_ENV === 'development'
			? [logger(), formData()]
			: [formData()],
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
