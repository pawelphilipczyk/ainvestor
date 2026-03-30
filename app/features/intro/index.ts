import { jsx } from 'remix/component/jsx-runtime'
import { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { t } from '../../lib/i18n.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import { getLayoutSession } from '../../lib/session.ts'
import { IntroPage } from './intro-page.tsx'

export const homeController = {
	actions: {
		async index(context: AppRequestContext) {
			const layoutSession = getLayoutSession(context.get(Session))
			return render({
				title: t('meta.title.home'),
				session: layoutSession,
				currentPage: 'home',
				body: jsx(IntroPage, {}),
			})
		},
	},
}
