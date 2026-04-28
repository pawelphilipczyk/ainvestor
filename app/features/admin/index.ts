import { jsx } from 'remix/component/jsx-runtime'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { t } from '../../lib/i18n.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import { readFlashedBanner } from '../../lib/session-flash.ts'
import { isAdmin } from '../catalog/catalog-load-context.ts'
import { fetchSharedCatalogSnapshot } from '../catalog/lib.ts'
import { AdminETFImportPage } from './admin-etf-import-page.tsx'

export const adminController = {
	actions: {
		async etfImport(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			const layoutSession = getLayoutSession(context.get(Session))
			const catalogSnapshot = await fetchSharedCatalogSnapshot()

			return render({
				title: t('meta.title.adminEtfImport'),
				session: layoutSession,
				currentPage: 'admin',
				body: jsx(AdminETFImportPage, {
					canImport: isAdmin({
						session,
						layoutSession,
						ownerLogin: catalogSnapshot.ownerLogin,
					}),
					sharedCatalogOwnerLogin: catalogSnapshot.ownerLogin,
				}),
				flashBanner: readFlashedBanner(context.get(Session)),
				init: { headers: { 'Cache-Control': 'no-store' } },
			})
		},
	},
}

export { AdminETFImportPage }
