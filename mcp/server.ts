/**
 * stdio entry point for the AI Investor MCP server.
 *
 * `./stdout-guard.ts` must stay the first import: it redirects console output
 * away from stdout, which carries the protocol.
 */
import './stdout-guard.ts'

import { createInterface } from 'node:readline'

import { createAinvestorMcpServer } from './ainvestor-server.ts'
import { describeMcpConfig, resolveMcpConfig } from './config.ts'
import type { JsonRpcResponse } from './jsonrpc.ts'
import {
	errorResponse,
	JSON_RPC_ERROR_CODES,
	serializeJsonRpcMessage,
} from './jsonrpc.ts'

function writeResponse(response: JsonRpcResponse): void {
	process.stdout.write(serializeJsonRpcMessage(response))
}

async function main(): Promise<void> {
	const config = resolveMcpConfig()
	// The stdio server runs on the user's own machine, so it is the only place a
	// tool may read a local file.
	const server = createAinvestorMcpServer({
		credentials: {
			githubToken: config.githubToken,
			dataGistId: config.dataGistId,
		},
		allowLocalFileTools: true,
	})

	console.error('[mcp] ready', JSON.stringify(describeMcpConfig(config)))

	/** Never rejects: a dispatch failure must not take down the read loop. */
	async function dispatch(parsed: unknown): Promise<void> {
		try {
			const response = await server.handleMessage(parsed)
			if (response !== null) writeResponse(response)
		} catch (error) {
			console.error('[mcp] Unhandled dispatch failure', error)
		}
	}

	const inFlight = new Set<Promise<void>>()
	const lines = createInterface({ input: process.stdin })

	for await (const line of lines) {
		const trimmed = line.trim()
		if (trimmed.length === 0) continue

		let parsed: unknown
		try {
			parsed = JSON.parse(trimmed)
		} catch {
			writeResponse(
				errorResponse({
					id: null,
					code: JSON_RPC_ERROR_CODES.parseError,
					message: 'Message is not valid JSON',
				}),
			)
			continue
		}

		// Deliberately not awaited: a slow tool call must not stall the next
		// message. JSON-RPC matches responses by id, so replying out of order is
		// fine, and a client's keepalive ping still gets answered mid-call.
		const work = dispatch(parsed)
		inFlight.add(work)
		void work.then(() => inFlight.delete(work))
	}

	// stdin closed: finish what is already running before exiting.
	await Promise.all(inFlight)
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
