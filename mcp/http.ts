/**
 * Streamable HTTP transport for the MCP server.
 *
 * Every request carries its own GitHub token, so the server holds no secret and
 * is multi-user: whoever presents a token reads **that token's** gist, and a
 * request without one reads nothing. This is the same trust model as the stdio
 * configuration, moved from a local file to a request header.
 *
 * Only the single-JSON-response half of the transport is implemented. That is
 * spec-legal for request/response tools; SSE would only matter for
 * server-initiated messages, which this server never sends.
 */
import { createAinvestorMcpServer } from './ainvestor-server.ts'
import { callerIsApproved } from './approved-caller.ts'
import type { GistCredentials } from './data-gist.ts'
import type { JsonRpcResponse } from './jsonrpc.ts'
import { errorResponse, JSON_RPC_ERROR_CODES } from './jsonrpc.ts'
import {
	REQUIRED_GITHUB_SCOPE,
	resolvePublicOrigin,
	resourceMetadataUrl,
} from './oauth-metadata.ts'
import { SUPPORTED_PROTOCOL_VERSIONS } from './protocol.ts'

/** Optional per-request override, naming the gist this caller wants read. */
const GIST_ID_HEADER = 'x-ainvestor-gist-id'

/**
 * A JSON-RPC message is a few hundred bytes. The app's multipart limits do not
 * apply to `application/json`, so without a ceiling here any caller could make
 * the machine buffer an unbounded body.
 */
const MAX_BODY_BYTES = 256 * 1024

function jsonResponse(params: {
	body: unknown
	status: number
	headers?: Record<string, string>
}): Response {
	return new Response(JSON.stringify(params.body), {
		status: params.status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
			...params.headers,
		},
	})
}

function protocolError(params: {
	code: number
	message: string
	status: number
	headers?: Record<string, string>
}): Response {
	return jsonResponse({
		body: errorResponse({
			id: null,
			code: params.code,
			message: params.message,
		}),
		status: params.status,
		...(params.headers === undefined ? {} : { headers: params.headers }),
	})
}

/**
 * The spec requires rejecting a mismatched `Origin` to blunt DNS rebinding.
 * Compared against the deployment's own public origin rather than
 * `request.url`, which is `http://` behind a TLS-terminating proxy and would
 * reject every legitimate browser request.
 */
function originIsAllowed(
	request: Request,
	publicOrigin: string | null,
): boolean {
	const origin = request.headers.get('Origin')
	if (origin === null) return true
	try {
		const requested = new URL(origin).origin
		if (publicOrigin !== null && requested === new URL(publicOrigin).origin) {
			return true
		}
		return requested === new URL(request.url).origin
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

/**
 * Gist ids are hex, but anything that cannot alter the request path is safe.
 * Without this, `../user/repos` would collapse during URL parsing and point the
 * server's authenticated call at a different GitHub endpoint entirely.
 */
function isWellFormedGistId(value: string): boolean {
	return /^[A-Za-z0-9]{1,64}$/.test(value)
}

type CredentialsResult =
	| { ok: true; credentials: GistCredentials }
	| { ok: false; reason: 'missing-token' | 'bad-gist-id' | 'not-approved' }

/**
 * Credentials come from the request; the deployment supplies at most a default
 * gist, and only to a caller who has proved they are entitled to it.
 *
 * Without that proof `AINVESTOR_GIST_ID` would hand the deployment owner's
 * holdings to any stranger with any GitHub token, because secret gists are
 * unlisted rather than access-controlled.
 */
async function readCredentials(request: Request): Promise<CredentialsResult> {
	const githubToken = readBearerToken(request)
	if (githubToken === null) return { ok: false, reason: 'missing-token' }

	const headerGistId = (request.headers.get(GIST_ID_HEADER) ?? '').trim()
	if (headerGistId.length > 0 && !isWellFormedGistId(headerGistId)) {
		return { ok: false, reason: 'bad-gist-id' }
	}
	if (headerGistId.length > 0) {
		return {
			ok: true,
			credentials: { githubToken, dataGistId: headerGistId },
		}
	}

	const pinnedGistId = (process.env.AINVESTOR_GIST_ID ?? '').trim()
	if (pinnedGistId.length > 0) {
		if (!(await callerIsApproved(githubToken))) {
			return { ok: false, reason: 'not-approved' }
		}
		return {
			ok: true,
			credentials: { githubToken, dataGistId: pinnedGistId },
		}
	}

	// No pinned gist: the caller's own gist is discovered from their own token,
	// which is safe for anyone.
	return { ok: true, credentials: { githubToken, dataGistId: null } }
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

/** Reads the body, refusing anything past the ceiling instead of buffering it. */
async function readBoundedBody(request: Request): Promise<string | null> {
	const declaredLength = Number(request.headers.get('Content-Length') ?? '')
	if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
		return null
	}

	const body = request.body
	if (body === null) return ''

	const reader = body.getReader()
	const decoder = new TextDecoder()
	let text = ''
	let total = 0
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		total += value.byteLength
		if (total > MAX_BODY_BYTES) {
			await reader.cancel()
			return null
		}
		text += decoder.decode(value, { stream: true })
	}
	return text + decoder.decode()
}

/**
 * True when a tool failed because GitHub rejected the credential rather than
 * because the data was unavailable. Those must reach the client as a transport
 * `401`, or a client holding an expired token never learns to refresh it and
 * the connector stays broken until it is removed and re-added.
 */
function isCredentialFailure(response: JsonRpcResponse): boolean {
	if (!('result' in response)) return false
	const result = response.result as {
		isError?: boolean
		content?: { text?: string }[]
	}
	if (result.isError !== true) return false
	const text = result.content?.[0]?.text ?? ''
	return /\b(401|403)\b/.test(text)
}

/** Handles one MCP HTTP request. Does no routing, so tests can call it directly. */
export async function handleMcpHttpRequest(
	request: Request,
): Promise<Response> {
	const publicOrigin = resolvePublicOrigin(request)

	if (!originIsAllowed(request, publicOrigin)) {
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

	const credentials = await readCredentials(request)
	if (!credentials.ok) {
		if (credentials.reason === 'not-approved') {
			return protocolError({
				code: JSON_RPC_ERROR_CODES.invalidRequest,
				message:
					'This deployment serves a pinned gist and your GitHub account is not on its allowlist.',
				status: 403,
			})
		}
		if (credentials.reason === 'bad-gist-id') {
			return protocolError({
				code: JSON_RPC_ERROR_CODES.invalidParams,
				message: `${GIST_ID_HEADER} must be alphanumeric`,
				status: 400,
			})
		}
		return protocolError({
			code: JSON_RPC_ERROR_CODES.invalidRequest,
			message:
				'Missing credentials. Send `Authorization: Bearer <GitHub token with the gist scope>`.',
			status: 401,
			headers: { 'WWW-Authenticate': authenticateChallenge(publicOrigin) },
		})
	}

	const rawBody = await readBoundedBody(request)
	if (rawBody === null) {
		return protocolError({
			code: JSON_RPC_ERROR_CODES.invalidRequest,
			message: `Body exceeds ${MAX_BODY_BYTES} bytes`,
			status: 413,
		})
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(rawBody)
	} catch {
		return protocolError({
			code: JSON_RPC_ERROR_CODES.parseError,
			message: 'Body is not valid JSON',
			status: 400,
		})
	}

	const server = createAinvestorMcpServer(credentials.credentials)
	const response = await server.handleMessage(parsed)

	// A notification draws no JSON-RPC response, and the transport says to
	// acknowledge it with an empty 202 rather than an empty body on 200.
	if (response === null) {
		return new Response(null, {
			status: 202,
			headers: { 'Cache-Control': 'no-store' },
		})
	}

	if (isCredentialFailure(response)) {
		return jsonResponse({
			body: response,
			status: 401,
			headers: { 'WWW-Authenticate': authenticateChallenge(publicOrigin) },
		})
	}

	return jsonResponse({ body: response, status: 200 })
}

/** RFC 9728 challenge, pointing the client at discovery and the needed scope. */
function authenticateChallenge(publicOrigin: string | null): string {
	if (publicOrigin === null) return `Bearer scope="${REQUIRED_GITHUB_SCOPE}"`
	const metadataUrl = resourceMetadataUrl(publicOrigin)
	return `Bearer resource_metadata="${metadataUrl}", scope="${REQUIRED_GITHUB_SCOPE}"`
}
