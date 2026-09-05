/**
 * Minimal JSON-RPC 2.0 types and helpers for the stdio MCP transport.
 *
 * Hand-rolled on purpose: the official SDK pulls in ~90 packages (express, hono,
 * zod, ajv) for a server that only needs newline-delimited JSON over stdio.
 */

export const JSONRPC_VERSION = '2.0'

/** Standard JSON-RPC codes, mirrored from the MCP schema. */
export const JSON_RPC_ERROR_CODES = {
	parseError: -32700,
	invalidRequest: -32600,
	methodNotFound: -32601,
	invalidParams: -32602,
	internalError: -32603,
} as const

export type JsonRpcId = string | number

/** An incoming message. Requests carry an `id`; notifications do not. */
export type JsonRpcIncoming = {
	jsonrpc: string
	id?: JsonRpcId
	method: string
	params?: unknown
}

export type JsonRpcResponse =
	| {
			jsonrpc: typeof JSONRPC_VERSION
			id: JsonRpcId
			result: Record<string, unknown>
	  }
	| {
			jsonrpc: typeof JSONRPC_VERSION
			id: JsonRpcId | null
			error: { code: number; message: string }
	  }

export function successResponse(
	id: JsonRpcId,
	result: Record<string, unknown>,
): JsonRpcResponse {
	return { jsonrpc: JSONRPC_VERSION, id, result }
}

export function errorResponse(params: {
	id: JsonRpcId | null
	code: number
	message: string
}): JsonRpcResponse {
	const { id, code, message } = params
	return { jsonrpc: JSONRPC_VERSION, id, error: { code, message } }
}

/** True when the value is a well-formed JSON-RPC 2.0 request or notification. */
export function isJsonRpcIncoming(value: unknown): value is JsonRpcIncoming {
	if (value === null || typeof value !== 'object') return false
	const record = value as Record<string, unknown>
	if (record.jsonrpc !== JSONRPC_VERSION) return false
	if (typeof record.method !== 'string' || record.method.length === 0)
		return false
	const id = record.id
	if (id !== undefined && typeof id !== 'string' && typeof id !== 'number')
		return false
	return true
}

/**
 * Serialize one message for the stdio transport. Messages are newline-delimited
 * and MUST NOT contain embedded newlines; `JSON.stringify` escapes them inside
 * strings, so the result is always a single line.
 */
export function serializeJsonRpcMessage(response: JsonRpcResponse): string {
	return `${JSON.stringify(response)}\n`
}
