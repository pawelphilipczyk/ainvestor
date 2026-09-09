import type { McpToolResult } from '../protocol.ts'

/** Every read-only or write-confirmation tool answers with one JSON text block. */
export function jsonResult(payload: unknown): McpToolResult {
	return {
		content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
	}
}
