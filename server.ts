import * as http from 'node:http'

import { createRequestListener } from 'remix/node-fetch-server'

import { remixAssetServer } from './app/lib/remix-assets.ts'
import { router } from './app/router.ts'

function validateRequiredConfig(): void {
	const sharedCatalogGistId = (process.env.SHARED_CATALOG_GIST_ID ?? '').trim()
	if (sharedCatalogGistId.length === 0 && process.env.NODE_ENV !== 'test') {
		throw new Error(
			'[config] SHARED_CATALOG_GIST_ID must be set outside tests.',
		)
	}
}

validateRequiredConfig()

const server = http.createServer(
	createRequestListener(async (request: Request) => {
		try {
			return await router.fetch(request)
		} catch (error) {
			console.error(error)
			return new Response('Internal Server Error', { status: 500 })
		}
	}),
)

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 44100

server.listen(port, '0.0.0.0', async () => {
	console.log(`AI Investor is running on http://localhost:${port}`)
	// Tell `hmr.ts` the restart has finished. Without it `node-hmr` publishes
	// `server:update` as soon as the child is spawned, and a browser can
	// refresh against a server that is not listening yet. Only meaningful
	// under supervision; `remix/node-hmr/runtime` refuses to load anywhere
	// else, so it is imported behind the same flag the asset server uses.
	if (process.env.REMIX_NODE_HMR === '1') {
		const { emitServerReady } = await import('remix/node-hmr/runtime')
		emitServerReady()
	}
})

let shuttingDown = false

function shutdown() {
	if (shuttingDown) return
	shuttingDown = true
	server.close(() => {
		// Releases the asset server's file watcher and HMR channel. Both only
		// exist in development, and both hold the event loop open, so without
		// this the dev server ignores Ctrl-C.
		void remixAssetServer.close().finally(() => {
			process.exit(0)
		})
	})
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
