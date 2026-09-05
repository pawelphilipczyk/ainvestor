import type { JsonRpcIncoming, JsonRpcResponse } from './jsonrpc.ts'
import {
	errorResponse,
	isJsonRpcIncoming,
	JSON_RPC_ERROR_CODES,
	successResponse,
} from './jsonrpc.ts'

/** Latest MCP revision this server implements. */
export const LATEST_PROTOCOL_VERSION = '2025-11-25'

/**
 * Revisions we answer `initialize` with unchanged.
 *
 * Deliberately stops at 2025-06-18, the revision that **removed** JSON-RPC
 * batching: 2025-03-26 requires servers to accept batches, and this server does
 * not implement them. Claiming that revision would promise something we do not
 * do, so an older client is answered with our latest instead and decides for
 * itself whether to continue. Newer features across these two (structured
 * content, tasks) are additive and unused.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18'] as const

/** JSON Schema for a tool's arguments. Root must be an object per the MCP schema. */
export type McpInputSchema = {
	type: 'object'
	properties?: Record<string, object>
	required?: string[]
}

export type McpToolResult = {
	content: { type: 'text'; text: string }[]
	isError?: boolean
}

export type McpToolDefinition = {
	name: string
	title?: string
	description: string
	inputSchema: McpInputSchema
	handler: (args: Record<string, unknown>) => Promise<McpToolResult>
}

export type McpServerInfo = {
	name: string
	version: string
}

/**
 * Negotiate the revision to answer `initialize` with: echo the client's when we
 * support it, otherwise our latest (the client then decides whether to go on).
 */
export function negotiateProtocolVersion(requested: unknown): string {
	if (
		typeof requested === 'string' &&
		(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
	) {
		return requested
	}
	return LATEST_PROTOCOL_VERSION
}

function toolDescriptor(tool: McpToolDefinition) {
	return {
		name: tool.name,
		...(tool.title === undefined ? {} : { title: tool.title }),
		description: tool.description,
		inputSchema: tool.inputSchema,
	}
}

/** The request id when the message carries a usable one, else null (notification). */
function readRequestId(raw: unknown): string | number | null {
	if (raw === null || typeof raw !== 'object') return null
	const id = (raw as { id?: unknown }).id
	return typeof id === 'string' || typeof id === 'number' ? id : null
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/**
 * Dispatches parsed JSON-RPC messages. Kept free of any I/O so tests can drive
 * it directly without spawning a process.
 */
export function createMcpServer(params: {
	serverInfo: McpServerInfo
	tools: McpToolDefinition[]
	instructions?: string
}) {
	const { serverInfo, tools, instructions } = params
	const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))

	async function callTool(
		message: JsonRpcIncoming,
		id: string | number,
	): Promise<JsonRpcResponse> {
		const params =
			message.params !== null && typeof message.params === 'object'
				? (message.params as Record<string, unknown>)
				: {}
		const name = params.name
		if (typeof name !== 'string') {
			return errorResponse({
				id,
				code: JSON_RPC_ERROR_CODES.invalidParams,
				message: 'tools/call requires a string "name" parameter',
			})
		}
		const tool = toolsByName.get(name)
		if (tool === undefined) {
			// Failing to *find* a tool is a protocol error, unlike a failure inside one.
			return errorResponse({
				id,
				code: JSON_RPC_ERROR_CODES.invalidParams,
				message: `Unknown tool: ${name}`,
			})
		}
		const rawArguments = params.arguments
		const toolArguments =
			rawArguments !== null && typeof rawArguments === 'object'
				? (rawArguments as Record<string, unknown>)
				: {}
		try {
			const result = await tool.handler(toolArguments)
			return successResponse(id, { ...result })
		} catch (error) {
			// Errors from inside a tool belong in the result so the model can self-correct.
			return successResponse(id, {
				content: [{ type: 'text', text: errorText(error) }],
				isError: true,
			})
		}
	}

	/** Returns the response to write, or null for notifications and ignored messages. */
	async function handleMessage(raw: unknown): Promise<JsonRpcResponse | null> {
		const id = readRequestId(raw)

		// A message with no usable id is a notification, and JSON-RPC forbids
		// answering one. This has to be decided before the envelope is judged,
		// or a malformed notification draws an unsolicited error frame.
		if (id === null) return null

		if (!isJsonRpcIncoming(raw)) {
			return errorResponse({
				id,
				code: JSON_RPC_ERROR_CODES.invalidRequest,
				message: 'Not a valid JSON-RPC 2.0 request',
			})
		}

		const message = raw

		switch (message.method) {
			case 'initialize': {
				const requested =
					message.params !== null && typeof message.params === 'object'
						? (message.params as Record<string, unknown>).protocolVersion
						: undefined
				return successResponse(id, {
					protocolVersion: negotiateProtocolVersion(requested),
					capabilities: { tools: {} },
					serverInfo,
					...(instructions === undefined ? {} : { instructions }),
				})
			}
			case 'ping':
				return successResponse(id, {})
			case 'tools/list':
				return successResponse(id, { tools: tools.map(toolDescriptor) })
			case 'tools/call':
				return callTool(message, id)
			default:
				return errorResponse({
					id,
					code: JSON_RPC_ERROR_CODES.methodNotFound,
					message: `Unknown method: ${message.method}`,
				})
		}
	}

	return { handleMessage }
}
