import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
	buildAuthorizationServerMetadata,
	buildProtectedResourceMetadata,
	REQUIRED_GITHUB_SCOPE,
	resolvePublicOrigin,
	resourceMetadataUrl,
} from './oauth-metadata.ts'

const originalPublicOrigin = process.env.AINVESTOR_PUBLIC_ORIGIN

afterEach(() => {
	if (originalPublicOrigin === undefined) {
		delete process.env.AINVESTOR_PUBLIC_ORIGIN
	} else {
		process.env.AINVESTOR_PUBLIC_ORIGIN = originalPublicOrigin
	}
})

function requestWith(headers: Record<string, string>): Request {
	return new Request(
		'http://internal.local/.well-known/oauth-protected-resource',
		{
			headers,
		},
	)
}

describe('public origin resolution', () => {
	it('honours the forwarded scheme, not the internal one', () => {
		// Fly terminates TLS and forwards plain HTTP. Trusting request.url would
		// advertise http:// metadata URLs and break the whole flow.
		delete process.env.AINVESTOR_PUBLIC_ORIGIN
		const origin = resolvePublicOrigin(
			requestWith({
				'X-Forwarded-Proto': 'https',
				Host: 'ainvestor.fly.dev',
			}),
		)
		assert.equal(origin, 'https://ainvestor.fly.dev')
	})

	it('takes only the first value of a forwarded header chain', () => {
		delete process.env.AINVESTOR_PUBLIC_ORIGIN
		const origin = resolvePublicOrigin(
			requestWith({
				'X-Forwarded-Proto': 'https, http',
				'X-Forwarded-Host': 'ainvestor.fly.dev, internal.local',
			}),
		)
		assert.equal(origin, 'https://ainvestor.fly.dev')
	})

	it('falls back to the request itself when nothing is forwarded', () => {
		delete process.env.AINVESTOR_PUBLIC_ORIGIN
		const origin = resolvePublicOrigin(
			new Request(
				'http://127.0.0.1:44100/.well-known/oauth-protected-resource',
			),
		)
		assert.equal(origin, 'http://127.0.0.1:44100')
	})

	it('lets an explicit setting override the headers, trailing slash trimmed', () => {
		process.env.AINVESTOR_PUBLIC_ORIGIN = 'https://ainvestor.example/'
		const origin = resolvePublicOrigin(
			requestWith({ 'X-Forwarded-Proto': 'http', Host: 'wrong.local' }),
		)
		assert.equal(origin, 'https://ainvestor.example')
	})
})

describe('protected resource metadata', () => {
	const origin = 'https://ainvestor.fly.dev'

	it('names this app as its own authorization server', () => {
		// GitHub publishes no RFC 8414 document, so pointing at github.com here
		// would fail discovery. We issue the metadata and delegate the endpoints.
		const metadata = buildProtectedResourceMetadata(origin)
		assert.deepEqual(metadata.authorization_servers, [origin])
	})

	it('identifies the MCP endpoint as the protected resource', () => {
		assert.equal(
			buildProtectedResourceMetadata(origin).resource,
			'https://ainvestor.fly.dev/mcp',
		)
	})

	it('asks for the gist scope and nothing more', () => {
		const metadata = buildProtectedResourceMetadata(origin)
		assert.deepEqual(metadata.scopes_supported, ['gist'])
		assert.equal(REQUIRED_GITHUB_SCOPE, 'gist')
	})

	it('accepts the token in the header only, never the query string', () => {
		assert.deepEqual(
			buildProtectedResourceMetadata(origin).bearer_methods_supported,
			['header'],
		)
	})

	it('publishes its metadata at the well-known path clients construct', () => {
		assert.equal(
			resourceMetadataUrl(origin),
			'https://ainvestor.fly.dev/.well-known/oauth-protected-resource',
		)
	})
})

describe('authorization server metadata', () => {
	const origin = 'https://ainvestor.fly.dev'
	const metadata = buildAuthorizationServerMetadata(origin)

	it('uses an issuer matching the discovery URL, as RFC 8414 requires', () => {
		assert.equal(metadata.issuer, origin)
	})

	it('delegates both endpoints to GitHub', () => {
		assert.equal(
			metadata.authorization_endpoint,
			'https://github.com/login/oauth/authorize',
		)
		assert.equal(
			metadata.token_endpoint,
			'https://github.com/login/oauth/access_token',
		)
	})

	it('advertises S256, the only challenge method GitHub accepts', () => {
		assert.deepEqual(metadata.code_challenge_methods_supported, ['S256'])
	})

	it('advertises no registration endpoint, so clients use preregistered credentials', () => {
		// Dynamic client registration is not supported: the user registers a
		// GitHub OAuth App and pastes its id and secret into the connector.
		assert.equal('registration_endpoint' in metadata, false)
	})
})
