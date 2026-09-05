import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { EtfEntry } from '../app/lib/gist.ts'
import { GIST_FILENAME } from '../app/lib/gist.ts'
import { resetDataGistIdCache } from './data-gist.ts'
import { handleMcpHttpRequest } from './http.ts'
import { LATEST_PROTOCOL_VERSION } from './protocol.ts'

const ENDPOINT = 'https://ainvestor.fly.dev/mcp'
const TOKEN = 'ghp_test_token'

const originalFetch = globalThis.fetch
const originalGistId = process.env.AINVESTOR_GIST_ID

afterEach(() => {
	globalThis.fetch = originalFetch
	resetDataGistIdCache()
	if (originalGistId === undefined) delete process.env.AINVESTOR_GIST_ID
	else process.env.AINVESTOR_GIST_ID = originalGistId
})

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
		assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer')
		const body = (await response.json()) as { error: { message: string } }
		assert.match(body.error.message, /gist scope/)
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

	it('lists the same tools the stdio transport exposes', async () => {
		const response = await handleMcpHttpRequest(
			post({ body: request(1, 'tools/list') }),
		)
		const body = (await response.json()) as {
			result: { tools: { name: string }[] }
		}
		assert.deepEqual(
			body.result.tools.map((tool) => tool.name),
			['get_portfolio'],
		)
	})

	it('reads the portfolio of the gist pinned by header', async () => {
		stubGist({
			'gist-a': [{ id: '1', name: 'VWCE', value: 1000, currency: 'PLN' }],
		})
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'tools/call', {
					name: 'get_portfolio',
					arguments: {},
				}),
				headers: { 'X-Ainvestor-Gist-Id': 'gist-a' },
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
			'gist-a': [{ id: '1', name: 'VWCE', value: 1000, currency: 'PLN' }],
			'gist-b': [{ id: '2', name: 'IWDA', value: 7777, currency: 'PLN' }],
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

		assert.equal(await totalFor('token-one', 'gist-a'), 1000)
		assert.equal(await totalFor('token-two', 'gist-b'), 7777)
		assert.equal(await totalFor('token-one', 'gist-a'), 1000)
	})

	it('falls back to the deployment gist id when no header is sent', async () => {
		process.env.AINVESTOR_GIST_ID = 'gist-from-env'
		const requestedUrls = stubGist({
			'gist-from-env': [{ id: '1', name: 'VWCE', value: 42, currency: 'PLN' }],
		})
		await handleMcpHttpRequest(
			post({
				body: request(1, 'tools/call', {
					name: 'get_portfolio',
					arguments: {},
				}),
			}),
		)
		assert.match(requestedUrls[0], /\/gists\/gist-from-env$/)
	})

	it('reports a gist failure as a tool error, not a transport error', async () => {
		globalThis.fetch = async () => new Response(null, { status: 401 })
		process.env.AINVESTOR_GIST_ID = 'gist-a'
		const response = await handleMcpHttpRequest(
			post({
				body: request(1, 'tools/call', {
					name: 'get_portfolio',
					arguments: {},
				}),
			}),
		)
		assert.equal(
			response.status,
			200,
			'the transport succeeded; the tool did not',
		)
		const body = (await response.json()) as {
			result: { isError: boolean; content: { text: string }[] }
		}
		assert.equal(body.result.isError, true)
		assert.match(body.result.content[0].text, /401/)
	})
})
