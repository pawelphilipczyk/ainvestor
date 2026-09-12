/**
 * Shared `Accept` checks for handlers that serve both full document
 * navigation and a `data-rmx-target` frame fetch (the rc.2 runtime's native
 * form navigation — see `docs/UI_ARCHITECTURE_GUIDELINES.md` §10).
 *
 * Keep these in one place so portfolio, guidelines, advice and catalog stay
 * aligned on what each `Accept` value means.
 */

/** True when the client asked for JSON (API-style tests and ad hoc fetch callers). */
export function requestAcceptsApplicationJson(request: Request): boolean {
	return request.headers.get('Accept')?.includes('application/json') ?? false
}

/**
 * True when `Accept` is exactly `text/html` — matches the header
 * `@remix-run/ui`'s default frame resolver sends for every `data-rmx-target`
 * fetch (GET or POST).
 */
export function requestAcceptsFrameSubmitHtml(request: Request): boolean {
	const accept = request.headers.get('Accept') ?? ''
	return accept.trim() === 'text/html'
}
