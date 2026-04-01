import * as http from 'node:http'

import { createRequestListener } from 'remix/node-fetch-server'

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

server.listen(port, '0.0.0.0', () => {
	console.log(`AI Investor is running on http://localhost:${port}`)
})

let shuttingDown = false

function shutdown() {
	if (shuttingDown) return
	shuttingDown = true
	server.close(() => {
		process.exit(0)
	})
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
