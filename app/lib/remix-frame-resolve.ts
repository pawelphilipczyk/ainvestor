import { t } from './i18n.ts'

/**
 * Resolves Remix {@link Frame} `src` during SSR by delegating to the app router.
 * Uses a dynamic import so `router.ts` can import feature controllers without a cycle.
 */
export async function resolveRemixFrameContent(
	request: Request,
	src: string,
): Promise<string> {
	const { router } = await import('../router.ts')
	const targetUrl = new URL(src, request.url)
	const fragmentRequest = new Request(targetUrl.toString(), {
		method: 'GET',
		headers: request.headers,
	})
	const response = await router.fetch(fragmentRequest)
	const body = await response.text()
	if (!response.ok) {
		const message = t('catalog.etfDetail.fragmentLoadFailed')
		return `<p class="text-sm text-destructive" role="alert">${message}</p>`
	}
	return body
}
