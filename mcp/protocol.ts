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
 * Revisions we answer `initialize` with unchanged. Our surface is plain
 * `tools/list` + `tools/call` with text content, which is identical across
 * these; newer features (structured content, tasks) are additive and unused.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
	'2025-11-25',
	'2025-06-18',
	'2025-03-26',
	'2024-11-05',
] as const

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
			return errorResponse(
				id,
				JSON_RPC_ERROR_CODES.invalidParams,
				'tools/call requires a string "name" parameter',
			)
		}
		const tool = toolsByName.get(name)
		if (tool === undefined) {
			// Failing to *find* a tool is a protocol error, unlike a failure inside one.
			return errorResponse(
				id,
				JSON_RPC_ERROR_CODES.invalidParams,
				`Unknown tool: ${name}`,
			)
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
		if (!isJsonRpcIncoming(raw)) {
			const id =
				raw !== null && typeof raw === 'object' && 'id' in raw
					? ((raw as { id?: unknown }).id ?? null)
					: null
			return errorResponse(
				typeof id === 'string' || typeof id === 'number' ? id : null,
				JSON_RPC_ERROR_CODES.invalidRequest,
				'Not a valid JSON-RPC 2.0 request',
			)
		}

		const message = raw
		const id = message.id

		// Notifications never get a response, whether or not we know the method.
		if (id === undefined) return null

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
				return errorResponse(
					id,
					JSON_RPC_ERROR_CODES.methodNotFound,
					`Unknown method: ${message.method}`,
				)
		}
	}

	return { handleMessage }
}
