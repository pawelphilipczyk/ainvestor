import { jsx } from 'remix/component/jsx-runtime'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { t } from '../../lib/i18n.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import { getLayoutSession, getSessionData } from '../../lib/session.ts'
import { htmlLangForCurrentUiLocale } from '../../lib/ui-locale.ts'
import { readFlashedBanner } from '../../lib/session-flash.ts'
import { fetchSharedCatalogSnapshot } from '../catalog/lib.ts'
import { AdminETFImportPage } from './admin-etf-import-page.tsx'

export const adminController = {
	actions: {
		async etfImport(context: AppRequestContext) {
			const session = getSessionData(context.get(Session))
			const layoutSession = getLayoutSession(context.get(Session))
			const catalogSnapshot = await fetchSharedCatalogSnapshot()
			const isCurrentUserAdmin = Boolean(
				session?.isAdmin === true || layoutSession?.isAdmin === true,
			)

			if (!isCurrentUserAdmin) {
				return new Response('Not found', {
					status: 404,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				})
			}

			return render({
				title: t('meta.title.adminEtfImport'),
				htmlLang: htmlLangForCurrentUiLocale(),
				session: layoutSession,
				currentPage: 'admin',
				body: jsx(AdminETFImportPage, {
					sharedCatalogOwnerLogin: catalogSnapshot.ownerLogin,
				}),
				flashBanner: readFlashedBanner(context.get(Session)),
				init: { headers: { 'Cache-Control': 'no-store' } },
			})
		},
	},
}

export { AdminETFImportPage }
