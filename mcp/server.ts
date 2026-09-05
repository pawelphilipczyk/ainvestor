/**
 * stdio entry point for the AI Investor MCP server.
 *
 * The stdio transport uses stdout as the protocol channel: nothing but MCP
 * messages may be written there. `console.log` is redirected to stderr below so
 * a stray log in this file or any imported module cannot corrupt the stream.
 */
import { createInterface } from 'node:readline'

import { resolveMcpConfig } from './config.ts'
import type { JsonRpcResponse } from './jsonrpc.ts'
import {
	errorResponse,
	JSON_RPC_ERROR_CODES,
	serializeJsonRpcMessage,
} from './jsonrpc.ts'
import { createMcpServer } from './protocol.ts'
import { createGetPortfolioTool } from './tools/portfolio.ts'

const SERVER_VERSION = '0.1.0'

const INSTRUCTIONS = `Read-only access to the user's AI Investor data, stored in their own private GitHub gist.

The data model has no time dimension: holdings carry a monetary value but no quantity, price, or date, and there is no transaction history. Do not infer returns, performance, or purchase timing from it.`

console.log = console.error

function writeResponse(response: JsonRpcResponse): void {
	process.stdout.write(serializeJsonRpcMessage(response))
}

async function main(): Promise<void> {
	const config = resolveMcpConfig()
	const server = createMcpServer({
		serverInfo: { name: 'ainvestor', version: SERVER_VERSION },
		instructions: INSTRUCTIONS,
		tools: [createGetPortfolioTool(config)],
	})

	const lines = createInterface({ input: process.stdin })

	for await (const line of lines) {
		const trimmed = line.trim()
		if (trimmed.length === 0) continue

		let parsed: unknown
		try {
			parsed = JSON.parse(trimmed)
		} catch {
			writeResponse(
				errorResponse(
					null,
					JSON_RPC_ERROR_CODES.parseError,
					'Message is not valid JSON',
				),
			)
			continue
		}

		try {
			const response = await server.handleMessage(parsed)
			if (response !== null) writeResponse(response)
		} catch (error) {
			// The loop must survive anything a handler throws, or the client hangs.
			console.error('[mcp] Unhandled dispatch failure', error)
		}
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
