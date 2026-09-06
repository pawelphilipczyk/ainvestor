/**
 * OAuth discovery metadata that lets an MCP client obtain a GitHub token for
 * this server without the app ever becoming an authorization server itself.
 *
 * The trick is in the issuer. A client discovers authorization-server metadata
 * at `<issuer>/.well-known/oauth-authorization-server`, and GitHub publishes no
 * such document — so naming GitHub as the issuer would simply fail discovery.
 * Instead this app is the issuer and its metadata points `authorization_endpoint`
 * and `token_endpoint` straight at GitHub. The client then runs an ordinary
 * authorization-code + PKCE flow against GitHub and receives a GitHub token,
 * which is exactly the credential `POST /mcp` already expects.
 *
 * No `registration_endpoint` is advertised: dynamic client registration is not
 * supported, so the client must use credentials from a GitHub OAuth App that
 * the user registers and pastes into their connector settings.
 */

const GITHUB_AUTHORIZATION_ENDPOINT = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token'

/** The only GitHub scope these tools need. */
export const REQUIRED_GITHUB_SCOPE = 'gist'

/** Path of the MCP endpoint, relative to the public origin. */
const MCP_ENDPOINT_PATH = '/mcp'

function firstHeaderValue(raw: string | null): string | null {
	if (raw === null) return null
	const first = raw.split(',')[0]?.trim() ?? ''
	return first.length > 0 ? first : null
}

/**
 * The origin clients reach this app on.
 *
 * Behind Fly's proxy the request arrives over plain HTTP with the original
 * scheme in `X-Forwarded-Proto`, so trusting `request.url` alone would advertise
 * `http://` URLs and break the flow. `AINVESTOR_PUBLIC_ORIGIN` overrides
 * everything when a deployment needs certainty.
 */
export function resolvePublicOrigin(request: Request): string {
	const configured = (process.env.AINVESTOR_PUBLIC_ORIGIN ?? '').trim()
	if (configured.length > 0) return configured.replace(/\/+$/, '')

	const requestUrl = new URL(request.url)
	const forwardedProtocol = firstHeaderValue(
		request.headers.get('X-Forwarded-Proto'),
	)
	const forwardedHost = firstHeaderValue(
		request.headers.get('X-Forwarded-Host'),
	)

	const protocol = forwardedProtocol ?? requestUrl.protocol.replace(':', '')
	const host = forwardedHost ?? request.headers.get('Host') ?? requestUrl.host
	return `${protocol}://${host}`
}

/** Canonical URI of the protected resource, as used in the metadata document. */
export function mcpResourceUri(origin: string): string {
	return `${origin}${MCP_ENDPOINT_PATH}`
}

/** Where a client can read this server's protected-resource metadata. */
export function resourceMetadataUrl(origin: string): string {
	return `${origin}/.well-known/oauth-protected-resource`
}

/** RFC 9728 protected resource metadata. */
export function buildProtectedResourceMetadata(origin: string) {
	return {
		resource: mcpResourceUri(origin),
		authorization_servers: [origin],
		scopes_supported: [REQUIRED_GITHUB_SCOPE],
		bearer_methods_supported: ['header'],
		resource_name: 'AI Investor',
	}
}

/**
 * RFC 8414 authorization server metadata. `issuer` must match the URL the
 * client used for discovery, which is this app; the endpoints are GitHub's.
 */
export function buildAuthorizationServerMetadata(origin: string) {
	return {
		issuer: origin,
		authorization_endpoint: GITHUB_AUTHORIZATION_ENDPOINT,
		token_endpoint: GITHUB_TOKEN_ENDPOINT,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: [
			'client_secret_post',
			'client_secret_basic',
		],
		scopes_supported: [REQUIRED_GITHUB_SCOPE],
	}
}

/** JSON response for a metadata document, cacheable and readable cross-origin. */
export function metadataResponse(document: object): Response {
	return new Response(JSON.stringify(document, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3600',
			// Discovery may be performed by a browser-based client.
			'Access-Control-Allow-Origin': '*',
		},
	})
}
