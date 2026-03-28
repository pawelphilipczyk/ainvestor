import { jsx } from 'remix/component/jsx-runtime'
import type { Session } from 'remix/session'
import { render } from '../../components/render.ts'
import { t } from '../../lib/i18n.ts'
import { getLayoutSession } from '../../lib/session.ts'
import { IntroPage } from './intro-page.tsx'

export const homeController = {
	async index(context: { session: Session }) {
		const layoutSession = getLayoutSession(context.session)
		return render({
			title: t('meta.title.home'),
			session: layoutSession,
			currentPage: 'home',
			body: jsx(IntroPage, {}),
		})
	},
}
