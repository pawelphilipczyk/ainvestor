import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { JSON_RPC_ERROR_CODES, serializeJsonRpcMessage } from './jsonrpc.ts'
import type { McpToolDefinition } from './protocol.ts'
import {
	createMcpServer,
	LATEST_PROTOCOL_VERSION,
	negotiateProtocolVersion,
} from './protocol.ts'

function testTool(
	overrides: Partial<McpToolDefinition> = {},
): McpToolDefinition {
	return {
		name: 'echo',
		description: 'Echoes its argument back.',
		inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
		handler: async (args) => ({
			content: [{ type: 'text', text: String(args.text ?? '') }],
		}),
		...overrides,
	}
}

function newServer(tools: McpToolDefinition[] = [testTool()]) {
	return createMcpServer({
		serverInfo: { name: 'ainvestor', version: '0.1.0' },
		tools,
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

/** Narrow a response to its success shape, failing the test when it is an error. */
function resultOf(response: unknown): Record<string, unknown> {
	assert.ok(response !== null && typeof response === 'object')
	const record = response as Record<string, unknown>
	assert.equal(
		'error' in record,
		false,
		`unexpected error: ${JSON.stringify(record)}`,
	)
	return record.result as Record<string, unknown>
}

describe('mcp protocol', () => {
	it('echoes a supported protocol version back to the client', async () => {
		const server = newServer()
		const response = await server.handleMessage(
			request(1, 'initialize', { protocolVersion: '2025-06-18' }),
		)
		assert.equal(resultOf(response).protocolVersion, '2025-06-18')
	})

	it('answers with its own latest version when the client asks for an unknown one', () => {
		assert.equal(
			negotiateProtocolVersion('1999-01-01'),
			LATEST_PROTOCOL_VERSION,
		)
		assert.equal(negotiateProtocolVersion(undefined), LATEST_PROTOCOL_VERSION)
		assert.equal(negotiateProtocolVersion(42), LATEST_PROTOCOL_VERSION)
	})

	it('advertises tool capability and server info on initialize', async () => {
		const server = newServer()
		const result = resultOf(
			await server.handleMessage(
				request(1, 'initialize', { protocolVersion: LATEST_PROTOCOL_VERSION }),
			),
		)
		assert.deepEqual(result.capabilities, { tools: {} })
		assert.deepEqual(result.serverInfo, { name: 'ainvestor', version: '0.1.0' })
	})

	it('lists tools without leaking the handler', async () => {
		const server = newServer()
		const result = resultOf(
			await server.handleMessage(request(1, 'tools/list')),
		)
		const tools = result.tools as Record<string, unknown>[]
		assert.equal(tools.length, 1)
		assert.equal(tools[0].name, 'echo')
		assert.equal('handler' in tools[0], false)
		assert.deepEqual(tools[0].inputSchema, {
			type: 'object',
			properties: { text: { type: 'string' } },
		})
	})

	it('calls a tool and returns its content', async () => {
		const server = newServer()
		const result = resultOf(
			await server.handleMessage(
				request(1, 'tools/call', { name: 'echo', arguments: { text: 'hi' } }),
			),
		)
		assert.deepEqual(result.content, [{ type: 'text', text: 'hi' }])
		assert.equal(result.isError, undefined)
	})

	it('reports a failure inside a tool as isError, not a protocol error', async () => {
		const server = newServer([
			testTool({
				handler: async () => {
					throw new Error('gist unreachable')
				},
			}),
		])
		const result = resultOf(
			await server.handleMessage(request(1, 'tools/call', { name: 'echo' })),
		)
		assert.equal(result.isError, true)
		assert.deepEqual(result.content, [
			{ type: 'text', text: 'gist unreachable' },
		])
	})

	it('reports an unknown tool as a protocol error', async () => {
		const server = newServer()
		const response = (await server.handleMessage(
			request(1, 'tools/call', { name: 'nope' }),
		)) as { error: { code: number; message: string } }
		assert.equal(response.error.code, JSON_RPC_ERROR_CODES.invalidParams)
		assert.match(response.error.message, /Unknown tool: nope/)
	})

	it('rejects an unknown method', async () => {
		const server = newServer()
		const response = (await server.handleMessage(
			request(1, 'resources/list'),
		)) as {
			error: { code: number }
		}
		assert.equal(response.error.code, JSON_RPC_ERROR_CODES.methodNotFound)
	})

	it('never responds to a notification', async () => {
		const server = newServer()
		assert.equal(
			await server.handleMessage({
				jsonrpc: '2.0',
				method: 'notifications/initialized',
			}),
			null,
		)
		assert.equal(
			await server.handleMessage({
				jsonrpc: '2.0',
				method: 'notifications/unknown',
			}),
			null,
		)
	})

	it('answers ping with an empty result', async () => {
		const server = newServer()
		assert.deepEqual(
			resultOf(await server.handleMessage(request(7, 'ping'))),
			{},
		)
	})

	it('rejects a malformed envelope', async () => {
		const server = newServer()
		const response = (await server.handleMessage({
			id: 1,
			method: 'ping',
		})) as {
			error: { code: number }
		}
		assert.equal(response.error.code, JSON_RPC_ERROR_CODES.invalidRequest)
	})

	it('serializes every message onto a single line', () => {
		const serialized = serializeJsonRpcMessage({
			jsonrpc: '2.0',
			id: 1,
			result: { content: [{ type: 'text', text: 'line one\nline two' }] },
		})
		assert.equal(serialized.endsWith('\n'), true)
		assert.equal(serialized.trimEnd().includes('\n'), false)
	})
})
