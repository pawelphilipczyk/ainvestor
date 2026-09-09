import { enum_, object, parseSafe, string } from 'remix/data-schema'
import { createRedirectResponse } from 'remix/response/redirect'
import { objectFromFormData } from '../../lib/form-data-payload.ts'
import type { AppRequestContext } from '../../lib/request-context.ts'
import { SUPPORTED_UI_LOCALES } from '../../lib/ui-locale.ts'
import { uiLocaleCookie } from '../../lib/ui-locale-cookie.ts'
import { routes } from '../../routes.ts'

const SetUiLocaleSchema = object({
	locale: enum_(SUPPORTED_UI_LOCALES),
	shellReturnPath: string(),
})

function isSafeRelativePath(value: string): boolean {
	if (value.length === 0 || value.length > 2048) return false
	if (!value.startsWith('/') || value.startsWith('//')) return false
	if (value.includes('\\') || value.includes('\n') || value.includes('\r')) {
		return false
	}
	return true
}

export const localeController = {
	actions: {
		async set(context: AppRequestContext) {
			const form = context.get(FormData)
			const formPayload = objectFromFormData(form) as Record<string, string>
			const parsed = parseSafe(SetUiLocaleSchema, formPayload)
			if (!parsed.success) {
				return createRedirectResponse(routes.home.index.href())
			}
			const { locale, shellReturnPath } = parsed.value
			if (!isSafeRelativePath(shellReturnPath)) {
				return createRedirectResponse(routes.home.index.href())
			}
			const headers = new Headers()
			headers.append('Set-Cookie', await uiLocaleCookie.serialize(locale))
			return createRedirectResponse(shellReturnPath, { status: 303, headers })
		},
	},
}
