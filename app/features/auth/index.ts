import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import { isGithubLoginApproved } from '../../lib/approved-users.ts'
import { getClientId, getClientSecret } from '../../lib/auth.ts'
import { findOrCreateGist } from '../../lib/gist.ts'
import { routes } from '../../routes.ts'

export const authController = {
	async login() {
		const clientId = getClientId()
		if (!clientId) {
			return new Response('GH_CLIENT_ID is not configured', { status: 500 })
		}
		const params = new URLSearchParams({ client_id: clientId, scope: 'gist' })
		return createRedirectResponse(
			`https://github.com/login/oauth/authorize?${params}`,
		)
	},

	async callback(context: { request: Request; session: Session }) {
		const url = new URL(context.request.url)
		const code = url.searchParams.get('code')
		if (!code) return createRedirectResponse(routes.portfolio.index.href())

		const tokenRes = await fetch(
			'https://github.com/login/oauth/access_token',
			{
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					client_id: getClientId(),
					client_secret: getClientSecret(),
					code,
				}),
			},
		)

		if (!tokenRes.ok)
			return createRedirectResponse(routes.portfolio.index.href())
		const tokenData = (await tokenRes.json()) as {
			access_token?: string
			error?: string
		}
		const token = tokenData.access_token
		if (!token) return createRedirectResponse(routes.portfolio.index.href())

		const userRes = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
			},
		})
		const user = (await userRes.json()) as { login: string }

		context.session.regenerateId()
		context.session.set('login', user.login)

		if (!isGithubLoginApproved(user.login)) {
			context.session.unset('token')
			context.session.unset('gistId')
			context.session.set('approvalStatus', 'pending')
			return createRedirectResponse(routes.portfolio.index.href())
		}

		const gistId = await findOrCreateGist(token)
		context.session.set('token', token)
		context.session.set('gistId', gistId)
		context.session.unset('approvalStatus')

		return createRedirectResponse(routes.portfolio.index.href())
	},

	logout(context: { session: Session }) {
		context.session.destroy()
		return createRedirectResponse(routes.portfolio.index.href())
	},
}
