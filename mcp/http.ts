/**
 * Streamable HTTP transport for the MCP server.
 *
 * Every request carries its own GitHub token, so the server holds no secret and
 * is multi-user for free: whoever presents a token reads that token's gist, and
 * a request without one reads nothing. This is the same trust model as the stdio
 * configuration, moved from a local file to a request header.
 *
 * Only the single-JSON-response half of the transport is implemented. That is
 * spec-legal for request/response tools; SSE would only matter for
 * server-initiated messages, which this server never sends.
 */
import { createAinvestorMcpServer } from './ainvestor-server.ts'
import type { GistCredentials } from './data-gist.ts'
import type { JsonRpcResponse } from './jsonrpc.ts'
import { errorResponse, JSON_RPC_ERROR_CODES } from './jsonrpc.ts'
import {
	REQUIRED_GITHUB_SCOPE,
	resolvePublicOrigin,
	resourceMetadataUrl,
} from './oauth-metadata.ts'
import { SUPPORTED_PROTOCOL_VERSIONS } from './protocol.ts'

/** Optional per-request override; falls back to the deployment's own setting. */
const GIST_ID_HEADER = 'x-ainvestor-gist-id'

function jsonResponse(body: JsonRpcResponse, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
		},
	})
}

function protocolError(params: {
	code: number
	message: string
	status: number
	headers?: Record<string, string>
}): Response {
	const body = errorResponse({
		id: null,
		code: params.code,
		message: params.message,
	})
	return new Response(JSON.stringify(body), {
		status: params.status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
			...params.headers,
		},
	})
}

/**
 * The spec requires rejecting a mismatched `Origin` to blunt DNS rebinding.
 * Anthropic's server-side fetch sends none, so this only ever fires for a
 * browser, which is exactly the case it exists for.
 */
function originIsAllowed(request: Request): boolean {
	const origin = request.headers.get('Origin')
	if (origin === null) return true
	try {
		return new URL(origin).origin === new URL(request.url).origin
	} catch {
		return false
	}
}

/** `Bearer <token>`, case-insensitive on the scheme. */
function readBearerToken(request: Request): string | null {
	const header = request.headers.get('Authorization')
	if (header === null) return null
	const match = /^Bearer\s+(.+)$/i.exec(header.trim())
	if (match === null) return null
	const token = match[1].trim()
	return token.length > 0 ? token : null
}

function readCredentials(request: Request): GistCredentials | null {
	const githubToken = readBearerToken(request)
	if (githubToken === null) return null
	const headerGistId = (request.headers.get(GIST_ID_HEADER) ?? '').trim()
	const envGistId = (process.env.AINVESTOR_GIST_ID ?? '').trim()
	const dataGistId = headerGistId || envGistId
	return {
		githubToken,
		dataGistId: dataGistId.length > 0 ? dataGistId : null,
	}
}

/**
 * A client that has completed initialization sends the negotiated revision back
 * on every request. Absent is fine — `initialize` itself carries none.
 */
function protocolVersionIsAcceptable(request: Request): boolean {
	const version = request.headers.get('MCP-Protocol-Version')
	if (version === null) return true
	return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)
}

/** Handles one MCP HTTP request. Does no routing, so tests can call it directly. */
export async function handleMcpHttpRequest(
	request: Request,
): Promise<Response> {
	if (!originIsAllowed(request)) {
		return protocolError({
			code: JSON_RPC_ERROR_CODES.invalidRequest,
			message: 'Origin not allowed',
			status: 403,
		})
	}

	// GET opens a server-to-client SSE stream. This server never initiates
	// messages, and the spec's answer for that is 405.
	if (request.method !== 'POST') {
		return protocolError({
			code: JSON_RPC_ERROR_CODES.invalidRequest,
			message: 'This endpoint offers no SSE stream; use POST',
			status: 405,
			headers: { Allow: 'POST' },
		})
	}

	if (!protocolVersionIsAcceptable(request)) {
		return protocolError({
			code: JSON_RPC_ERROR_CODES.invalidRequest,
			message: `Unsupported MCP-Protocol-Version; this server implements ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`,
			status: 400,
		})
	}

	const credentials = readCredentials(request)
	if (credentials === null) {
		// RFC 9728: point the client at the metadata that names GitHub as the
		// authorization server, and state the scope so it asks for no more.
		const metadataUrl = resourceMetadataUrl(resolvePublicOrigin(request))
		return protocolError({
			code: JSON_RPC_ERROR_CODES.invalidRequest,
			message:
				'Missing credentials. Send `Authorization: Bearer <GitHub token with the gist scope>`.',
			status: 401,
			headers: {
				'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}", scope="${REQUIRED_GITHUB_SCOPE}"`,
			},
		})
	}

	let parsed: unknown
	try {
		parsed = await request.json()
	} catch {
		return protocolError({
			code: JSON_RPC_ERROR_CODES.parseError,
			message: 'Body is not valid JSON',
			status: 400,
		})
	}

	const server = createAinvestorMcpServer(credentials)
	const response = await server.handleMessage(parsed)

	// A notification draws no JSON-RPC response, and the transport says to
	// acknowledge it with an empty 202 rather than an empty body on 200.
	if (response === null) return new Response(null, { status: 202 })

	return jsonResponse(response, 200)
}
