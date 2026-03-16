import { createRedirectResponse } from 'remix/response/redirect'

import { findOrCreateGist } from '../../lib/gist.ts'
import { clearSessionCookie, createSessionCookie } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import {
	getClientId,
	getClientSecret,
	getSessionSecret,
} from '../shared/index.ts'

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

	async callback(context: { request: Request }) {
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

		const gistId = await findOrCreateGist(token)
		const sessionCookie = await createSessionCookie(
			{ token, gistId, login: user.login },
			getSessionSecret(),
		)

		return new Response(null, {
			status: 302,
			headers: {
				Location: routes.portfolio.index.href(),
				'Set-Cookie': sessionCookie,
			},
		})
	},

	logout() {
		return new Response(null, {
			status: 302,
			headers: {
				Location: routes.portfolio.index.href(),
				'Set-Cookie': clearSessionCookie(),
			},
		})
	},
}
