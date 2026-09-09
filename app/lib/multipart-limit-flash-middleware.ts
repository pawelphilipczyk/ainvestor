import {
	MaxFileSizeExceededError,
	MaxTotalSizeExceededError,
} from '@remix-run/form-data-parser'
import type { Middleware } from 'remix/fetch-router'
import { createRedirectResponse } from 'remix/response/redirect'
import { Session } from 'remix/session'
import { routes } from '../routes.ts'
import { t } from './i18n.ts'
import { flashBanner } from './session-flash.ts'

/**
 * Catches Remix multipart size-limit errors (thrown while parsing `FormData`)
 * and turns them into a flash + redirect instead of an uncaught 500.
 *
 * Must run **after** {@link session} so `Session` is on context, and **before**
 * {@link formData} so `await next()` includes the parser.
 */
export function multipartLimitFlashOnError(): Middleware {
	return async (context, next) => {
		try {
			return await next()
		} catch (error) {
			const isMultipartLimit =
				error instanceof MaxFileSizeExceededError ||
				error instanceof MaxTotalSizeExceededError
			if (!isMultipartLimit) throw error
			if (!context.has(Session)) throw error

			const session = context.get(Session)
			flashBanner(session, {
				text: t('errors.upload.fileTooLarge'),
				tone: 'error',
			})

			const requestUrl = new URL(context.request.url)
			const referer = context.request.headers.get('Referer')
			let location = routes.admin.etfImport.href()
			if (referer) {
				try {
					const refererUrl = new URL(referer)
					if (refererUrl.origin === requestUrl.origin) {
						location = referer
					}
				} catch {
					// keep default admin import URL
				}
			}

			return createRedirectResponse(location, { status: 302 })
		}
	}
}
