import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { APPROVED_GITHUB_LOGINS } from '../app/lib/approved-github-logins.ts'
import type { EtfEntry } from '../app/lib/gist.ts'
import { GIST_FILENAME } from '../app/lib/gist.ts'
import { resetApprovedCallerCache } from './approved-caller.ts'
import { resetDataGistIdCache } from './data-gist.ts'
import { handleMcpHttpRequest } from './http.ts'
import { LATEST_PROTOCOL_VERSION } from './protocol.ts'

const ENDPOINT = 'https://ainvestor.fly.dev/mcp'
const TOKEN = 'ghp_test_token'

const originalFetch = globalThis.fetch
const originalGistId = process.env.AINVESTOR_GIST_ID
const originalPublicOrigin = process.env.AINVESTOR_PUBLIC_ORIGIN
const originalAllowWrites = process.env.AINVESTOR_MCP_ALLOW_WRITES

afterEach(() => {
	globalThis.fetch = originalFetch
	resetDataGistIdCache()
	resetApprovedCallerCache()
	if (originalGistId === undefined) delete process.env.AINVESTOR_GIST_ID
	else process.env.AINVESTOR_GIST_ID = originalGistId
	if (originalPublicOrigin === undefined) {
		delete process.env.AINVESTOR_PUBLIC_ORIGIN
	} else {
		process.env.AINVESTOR_PUBLIC_ORIGIN = originalPublicOrigin
	}
	if (originalAllowWrites === undefined) {
		delete process.env.AINVESTOR_MCP_ALLOW_WRITES
	} else {
		process.env.AINVESTOR_MCP_ALLOW_WRITES = originalAllowWrites
	}
})

/** Tool names from a `tools/list` answer, in the order the server listed them. */
async function listToolNames(): Promise<string[]> {
	const response = await handleMcpHttpRequest(
		post({ body: request(1, 'tools/list') }),
	)
	const body = (await response.json()) as {
		result: { tools: { name: string }[] }
	}
	return body.result.tools.map((tool) => tool.name)
}

function post(params: {
	body?: unknown
	headers?: Record<string, string>
	rawBody?: string
}): Request {
	return new Request(ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${TOKEN}`,
			...params.headers,
		},
		body: params.rawBody ?? JSON.stringify(params.body),
	})
}

function request(id: number, method: string, params?: Record<string, unknown>) {
	return {
		jsonrpc: '2.0',
		id,
		method,
		...(params === undefined ? {} : { params }),
	}
}

/** Serve one holdings payload per gist id, recording which gists were fetched. */
function stubGist(entriesByGistId: Record<string, EtfEntry[]>): string[] {
	const requestedUrls: string[] = []
	globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
		const url = String(input)
		requestedUrls.push(url)
		const gistId = url.split('/gists/')[1] ?? ''
		const entries = entriesByGistId[gistId] ?? []
		return Response.json({
			files: { [GIST_FILENAME]: { content: JSON.stringify(entries) } },
		})
	}
	return requestedUrls
}

describe('mcp over http', () => {
	it('answers GET with 405, since it offers no SSE stream', async () => {
		const response = await handleMcpHttpRequest(
			new Request(ENDPOINT, {
				method: 'GET',
				headers: { Authorization: `Bearer ${TOKEN}` },
			}),
		)
		assert.equal(response.status, 405)
		assert.equal(response.headers.get('Allow'), 'POST')
	})

	it('rejects a request with no credentials', async () => {
		const response = await handleMcpHttpRequest(
			new Request(ENDPOINT, {
				method: 'POST',
				body: JSON.stringify(request(1, 'initialize')),
			}),
		)
		assert.equal(response.status, 401)
		const body = (await response.json()) as { error: { message: string } }
		assert.match(body.error.message, /gist scope/)
	})

	it('points an unauthenticated client at its OAuth metadata and scope', async () => {
		// RFC 9728 discovery: without this header a client cannot find out that
		// GitHub is the authorization server, and the sign-in flow never starts.
		process.env.AINVESTOR_PUBLIC_ORIGIN = 'https://ainvestor.fly.dev'
		const response = await handleMcpHttpRequest(
			new Request(ENDPOINT, {
				method: 'POST',
				body: JSON.stringify(request(1, 'initialize')),
			}),
		)
		assert.equal(response.status, 401)
		const challenge = response.headers.get('WWW-Authenticate') ?? ''
		assert.match(challenge, /^Bearer /)
		assert.match(
			challenge,
			/resource_metadata="https:\/\/ainvestor\.fly\.dev\/\.well-known\/oauth-protected-resource"/,
		)
		assert.match(challenge, /scope="gist"/)
	})

	it('rejects a gist id that could redirect the GitHub request', async () => {
		// `../user/repos` collapses during URL parsing and would point the
		// server's authenticated call at a different GitHub endpoint.
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'tools/call', {
					name: 'get_portfolio',
					arguments: {},
				}),
				headers: { 'X-Ainvestor-Gist-Id': '../user/repos' },
			}),
		)
		assert.equal(response.status, 400)
	})

	it('refuses a body past the ceiling instead of buffering it', async () => {
		const response = await handleMcpHttpRequest(
			new Request(ENDPOINT, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${TOKEN}`,
					'Content-Length': String(10 * 1024 * 1024),
				},
				body: JSON.stringify(request(1, 'ping')),
			}),
		)
		assert.equal(response.status, 413)
	})

	it('rejects an Authorization header that is not a bearer token', async () => {
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'ping'),
				headers: { Authorization: 'Basic abc' },
			}),
		)
		assert.equal(response.status, 401)
	})

	it('rejects a cross-origin browser request', async () => {
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'ping'),
				headers: { Origin: 'https://evil.test' },
			}),
		)
		assert.equal(response.status, 403)
	})

	it('allows a same-origin request and one with no Origin at all', async () => {
		const headerVariants: Record<string, string>[] = [
			{ Origin: 'https://ainvestor.fly.dev' },
			{},
		]
		for (const headers of headerVariants) {
			const response = await handleMcpHttpRequest(
				post({ body: request(1, 'ping'), headers }),
			)
			assert.equal(response.status, 200)
		}
	})

	it('rejects a protocol version it does not implement', async () => {
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'ping'),
				headers: { 'MCP-Protocol-Version': '2025-03-26' },
			}),
		)
		assert.equal(response.status, 400)
	})

	it('accepts the negotiated protocol version on later requests', async () => {
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'ping'),
				headers: { 'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION },
			}),
		)
		assert.equal(response.status, 200)
	})

	it('rejects a body that is not JSON', async () => {
		const response = await handleMcpHttpRequest(post({ rawBody: 'not json' }))
		assert.equal(response.status, 400)
		const body = (await response.json()) as { error: { code: number } }
		assert.equal(body.error.code, -32700)
	})

	it('acknowledges a notification with an empty 202', async () => {
		const response = await handleMcpHttpRequest(
			post({ body: { jsonrpc: '2.0', method: 'notifications/initialized' } }),
		)
		assert.equal(response.status, 202)
		assert.equal(await response.text(), '')
	})

	it('completes an initialize handshake', async () => {
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'initialize', {
					protocolVersion: LATEST_PROTOCOL_VERSION,
				}),
			}),
		)
		assert.equal(response.status, 200)
		assert.equal(
			response.headers.get('Content-Type'),
			'application/json',
			'a single JSON response is spec-legal; SSE is not required here',
		)
		const body = (await response.json()) as {
			result: { protocolVersion: string; serverInfo: { name: string } }
		}
		assert.equal(body.result.protocolVersion, LATEST_PROTOCOL_VERSION)
		assert.equal(body.result.serverInfo.name, 'ainvestor')
	})

	it('lists the same read tools the stdio transport exposes', async () => {
		delete process.env.AINVESTOR_MCP_ALLOW_WRITES
		assert.deepEqual(await listToolNames(), ['get_portfolio', 'get_guidelines'])
	})

	it('offers the write tools only where the deployment asked for them', async () => {
		process.env.AINVESTOR_MCP_ALLOW_WRITES = 'no'
		assert.deepEqual(await listToolNames(), ['get_portfolio', 'get_guidelines'])

		process.env.AINVESTOR_MCP_ALLOW_WRITES = '1'
		assert.deepEqual(await listToolNames(), [
			'get_portfolio',
			'get_guidelines',
			'set_guideline',
			'delete_guideline',
		])
	})

	it('reads the portfolio of the gist pinned by header', async () => {
		stubGist({
			gista: [{ id: '1', name: 'VWCE', value: 1000, currency: 'PLN' }],
		})
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'tools/call', {
					name: 'get_portfolio',
					arguments: {},
				}),
				headers: { 'X-Ainvestor-Gist-Id': 'gista' },
			}),
		)
		const body = (await response.json()) as {
			result: { content: { text: string }[] }
		}
		const payload = JSON.parse(body.result.content[0].text) as {
			totalValue: number
		}
		assert.equal(payload.totalValue, 1000)
	})

	it('serves each token its own gist, never another one', async () => {
		// The endpoint is multi-user: a cache keyed by anything but the token
		// would hand one caller someone else's holdings.
		stubGist({
			gista: [{ id: '1', name: 'VWCE', value: 1000, currency: 'PLN' }],
			gistb: [{ id: '2', name: 'IWDA', value: 7777, currency: 'PLN' }],
		})

		async function totalFor(token: string, gistId: string): Promise<number> {
			const response = await handleMcpHttpRequest(
				new Request(ENDPOINT, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${token}`,
						'X-Ainvestor-Gist-Id': gistId,
					},
					body: JSON.stringify(
						request(1, 'tools/call', {
							name: 'get_portfolio',
							arguments: {},
						}),
					),
				}),
			)
			const body = (await response.json()) as {
				result: { content: { text: string }[] }
			}
			return (JSON.parse(body.result.content[0].text) as { totalValue: number })
				.totalValue
		}

		assert.equal(await totalFor('token-one', 'gista'), 1000)
		assert.equal(await totalFor('token-two', 'gistb'), 7777)
		assert.equal(await totalFor('token-one', 'gista'), 1000)
	})

	it('refuses the pinned gist to a caller who is not on the allowlist', async () => {
		// AINVESTOR_GIST_ID names one specific gist. Serving it to anyone with any
		// GitHub token would hand a stranger the owner's holdings, because secret
		// gists are unlisted rather than access-controlled.
		process.env.AINVESTOR_GIST_ID = 'ownergist'
		const requestedUrls: string[] = []
		globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
			requestedUrls.push(String(input))
			return Response.json({ login: 'someone-else' })
		}

		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'tools/call', {
					name: 'get_portfolio',
					arguments: {},
				}),
			}),
		)

		assert.equal(response.status, 403)
		assert.equal(
			requestedUrls.some((url) => url.includes('ownergist')),
			false,
			"the owner's gist must never be read on a stranger's behalf",
		)
	})

	it('serves the pinned gist to an approved caller', async () => {
		process.env.AINVESTOR_GIST_ID = 'ownergist'
		globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input)
			if (url.endsWith('/user')) {
				return Response.json({ login: APPROVED_GITHUB_LOGINS[0] })
			}
			return Response.json({
				files: {
					[GIST_FILENAME]: {
						content: JSON.stringify([
							{ id: '1', name: 'VWCE', value: 42, currency: 'PLN' },
						]),
					},
				},
			})
		}

		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'tools/call', {
					name: 'get_portfolio',
					arguments: {},
				}),
			}),
		)

		assert.equal(response.status, 200)
		const body = (await response.json()) as {
			result: { content: { text: string }[] }
		}
		const payload = JSON.parse(body.result.content[0].text) as {
			totalValue: number
		}
		assert.equal(payload.totalValue, 42)
	})

	it('surfaces a rejected credential as HTTP 401 so the client refreshes', async () => {
		// Reporting an expired token as a healthy transport with a failing tool
		// leaves the client with no reason to refresh, and the connector stays
		// dead until it is removed and re-added.
		globalThis.fetch = async () => new Response(null, { status: 401 })
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'tools/call', {
					name: 'get_portfolio',
					arguments: {},
				}),
				headers: { 'X-Ainvestor-Gist-Id': 'gista' },
			}),
		)
		assert.equal(response.status, 401)
		assert.match(response.headers.get('WWW-Authenticate') ?? '', /^Bearer/)
	})

	it('keeps a non-credential tool failure as a tool error at HTTP 200', async () => {
		globalThis.fetch = async () => new Response(null, { status: 500 })
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'tools/call', {
					name: 'get_portfolio',
					arguments: {},
				}),
				headers: { 'X-Ainvestor-Gist-Id': 'gista' },
			}),
		)
		assert.equal(
			response.status,
			200,
			'the transport succeeded; the tool did not',
		)
		const body = (await response.json()) as { result: { isError: boolean } }
		assert.equal(body.result.isError, true)
	})
})
