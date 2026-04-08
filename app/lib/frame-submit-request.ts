/**
 * Shared `Accept` checks for handlers that serve both full document navigation and
 * `FrameSubmitEnhancement` fetches (`data-frame-submit` / `data-frame-replace-from-response`).
 *
 * Keep these in one place so portfolio, guidelines, and future features stay aligned
 * with `app/components/client/frame-submit.component.js`.
 */

/** True when the client asked for JSON (API-style tests and ad hoc fetch callers). */
export function requestAcceptsApplicationJson(request: Request): boolean {
	return request.headers.get('Accept')?.includes('application/json') ?? false
}

/**
 * True when `Accept` is exactly `text/html` — matches the header
 * `FrameSubmitEnhancement` sends for replace-from-response POSTs.
 */
export function requestAcceptsFrameSubmitHtml(request: Request): boolean {
	const accept = request.headers.get('Accept') ?? ''
	return accept.trim() === 'text/html'
}
