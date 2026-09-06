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

/** Hosts a local run may legitimately be reached on. */
function isLoopbackHost(host: string): boolean {
	const hostname = host.split(':')[0] ?? ''
	return (
		hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
	)
}

/**
 * The origin clients reach this app on.
 *
 * **This value is security-critical**: it becomes the OAuth issuer, the
 * `authorization_servers` entry and the `resource_metadata` challenge, so a
 * caller who could choose it could send clients to an authorization server of
 * their choosing and harvest GitHub tokens. Request headers are therefore never
 * trusted on their own — the host must be one this deployment knows it owns:
 *
 * 1. `AINVESTOR_PUBLIC_ORIGIN`, when set, wins outright.
 * 2. Otherwise `FLY_APP_NAME`, which Fly sets in the machine's environment and
 *    no request can forge, gives `https://<app>.fly.dev`.
 * 3. Otherwise a loopback host, so local development works.
 *
 * Returns null when none applies, which callers must treat as "cannot serve
 * discovery" rather than falling back to the request.
 */
export function resolvePublicOrigin(request: Request): string | null {
	const configured = (process.env.AINVESTOR_PUBLIC_ORIGIN ?? '').trim()
	if (configured.length > 0) return configured.replace(/\/+$/, '')

	const flyAppName = (process.env.FLY_APP_NAME ?? '').trim()
	if (flyAppName.length > 0) return `https://${flyAppName}.fly.dev`

	const requestUrl = new URL(request.url)
	const host = request.headers.get('Host') ?? requestUrl.host
	if (isLoopbackHost(host)) {
		const forwardedProtocol = firstHeaderValue(
			request.headers.get('X-Forwarded-Proto'),
		)
		const protocol = forwardedProtocol ?? requestUrl.protocol.replace(':', '')
		return `${protocol}://${host}`
	}

	return null
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
		// `refresh_token` matters when the user's OAuth App has "Expire user
		// access tokens" enabled: GitHub then issues tokens valid for 8 hours
		// alongside a refresh token, and a client that does not see this grant
		// advertised may never refresh — leaving the connector dead after 8 hours.
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		// GitHub documents client credentials in the request body only.
		// Advertising `client_secret_basic` would invite a client to send them as
		// a Basic header, which GitHub answers with incorrect_client_credentials.
		token_endpoint_auth_methods_supported: ['client_secret_post'],
		scopes_supported: [REQUIRED_GITHUB_SCOPE],
	}
}

/** JSON response for a metadata document, readable cross-origin. */
export function metadataResponse(document: object): Response {
	return new Response(JSON.stringify(document, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			// Deliberately private: the document names this deployment's own
			// origin, and a shared cache replaying one deployment's answer to
			// another's clients would redirect their sign-in.
			'Cache-Control': 'no-store',
			// Discovery may be performed by a browser-based client.
			'Access-Control-Allow-Origin': '*',
		},
	})
}

/** Discovery cannot be served when the deployment does not know its own origin. */
export function unknownOriginResponse(): Response {
	return new Response(
		JSON.stringify({
			error: 'server_error',
			error_description:
				'This deployment cannot determine its own public origin. Set AINVESTOR_PUBLIC_ORIGIN.',
		}),
		{
			status: 500,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		},
	)
}
