import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { isGithubLoginApproved } from '../../lib/approved-users.ts'
import { getClientId, getClientSecret } from '../../lib/auth.ts'
import { findOrCreateGist } from '../../lib/gist.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import { routes } from '../../routes.ts'
import {
	fetchSharedCatalogSnapshot,
	isSharedCatalogAdmin,
} from '../catalog/lib.ts'

const OAUTH_STATE_SESSION_KEY = 'oauthGithubState'

function newOAuthState(): string {
	return randomBytes(32).toString('hex')
}

function oauthStateMatches(expected: string, received: string): boolean {
	if (expected.length !== received.length) return false
	try {
		return timingSafeEqual(
			Buffer.from(expected, 'utf8'),
			Buffer.from(received, 'utf8'),
		)
	} catch {
		return false
	}
}

export const authController = {
	actions: {
		async login(context: AppRequestContext) {
			const clientId = getClientId()
			if (!clientId) {
				return new Response('GH_CLIENT_ID is not configured', { status: 500 })
			}
			const state = newOAuthState()
			context.get(Session).set(OAUTH_STATE_SESSION_KEY, state)
			const params = new URLSearchParams({
				client_id: clientId,
				scope: 'gist',
				state,
			})
			return createRedirectResponse(
				`https://github.com/login/oauth/authorize?${params}`,
			)
		},

		async callback(context: AppRequestContext) {
			const url = new URL(context.request.url)
			const code = url.searchParams.get('code')
			if (!code) return createRedirectResponse(routes.home.index.href())

			const receivedState = url.searchParams.get('state')
			const expectedState = context.get(Session).get(OAUTH_STATE_SESSION_KEY) as
				| string
				| undefined
			const stateOk =
				typeof receivedState === 'string' &&
				typeof expectedState === 'string' &&
				oauthStateMatches(expectedState, receivedState)
			if (stateOk) {
				context.get(Session).unset(OAUTH_STATE_SESSION_KEY)
			} else {
				context.get(Session).unset(OAUTH_STATE_SESSION_KEY)
				return createRedirectResponse(routes.home.index.href())
			}

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

			if (!tokenRes.ok) return createRedirectResponse(routes.home.index.href())
			const tokenData = (await tokenRes.json()) as {
				access_token?: string
				error?: string
			}
			const token = tokenData.access_token
			if (!token) return createRedirectResponse(routes.home.index.href())

			const userRes = await fetch('https://api.github.com/user', {
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github+json',
				},
			})
			const userJson = (await userRes.json()) as {
				login?: string
				message?: string
			}
			const login =
				typeof userJson.login === 'string' && userJson.login.length > 0
					? userJson.login
					: null

			if (!userRes.ok || !login) {
				console.error(
					'[auth] GitHub user fetch failed',
					userRes.status,
					userJson.message ?? userJson,
				)
				context.get(Session).regenerateId()
				context.get(Session).unset('token')
				context.get(Session).unset('gistId')
				context.get(Session).unset('login')
				context.get(Session).unset('approvalStatus')
				return createRedirectResponse(routes.home.index.href())
			}

			context.get(Session).regenerateId()
			context.get(Session).set('login', login)
			let isAdmin = false
			try {
				const sharedCatalogSnapshot = await fetchSharedCatalogSnapshot()
				isAdmin = isSharedCatalogAdmin({
					sessionLogin: login,
					ownerLogin: sharedCatalogSnapshot.ownerLogin,
				})
			} catch (error) {
				console.error('[auth] Shared catalog lookup failed', error)
			}
			context.get(Session).set('isAdmin', isAdmin)

			if (!isAdmin && !isGithubLoginApproved(login)) {
				context.get(Session).unset('token')
				context.get(Session).unset('gistId')
				context.get(Session).set('approvalStatus', 'pending')
				return createRedirectResponse(routes.home.index.href())
			}

			const gistId = await findOrCreateGist(token)
			context.get(Session).set('token', token)
			context.get(Session).set('gistId', gistId)
			context.get(Session).unset('approvalStatus')

			return createRedirectResponse(routes.home.index.href())
		},

		logout(context: AppRequestContext) {
			context.get(Session).destroy()
			return createRedirectResponse(routes.home.index.href())
		},
	},
}
