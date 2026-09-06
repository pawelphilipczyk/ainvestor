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
const originalFlyAppName = process.env.FLY_APP_NAME

afterEach(() => {
	if (originalPublicOrigin === undefined) {
		delete process.env.AINVESTOR_PUBLIC_ORIGIN
	} else {
		process.env.AINVESTOR_PUBLIC_ORIGIN = originalPublicOrigin
	}
	if (originalFlyAppName === undefined) delete process.env.FLY_APP_NAME
	else process.env.FLY_APP_NAME = originalFlyAppName
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
	it('refuses a host it cannot prove it owns', () => {
		// The origin becomes the OAuth issuer and the resource_metadata target.
		// Trusting a request header here would let a caller send clients to an
		// authorization server of their choosing and harvest GitHub tokens.
		delete process.env.AINVESTOR_PUBLIC_ORIGIN
		delete process.env.FLY_APP_NAME
		assert.equal(
			resolvePublicOrigin(
				requestWith({
					Host: 'evil.test',
					'X-Forwarded-Host': 'evil.test',
					'X-Forwarded-Proto': 'https',
				}),
			),
			null,
		)
	})

	it('derives the origin from the Fly app name, which no request can forge', () => {
		delete process.env.AINVESTOR_PUBLIC_ORIGIN
		process.env.FLY_APP_NAME = 'ainvestor-preview'
		assert.equal(
			resolvePublicOrigin(requestWith({ Host: 'evil.test' })),
			'https://ainvestor-preview.fly.dev',
		)
	})

	it('lets an explicit setting override everything, trailing slash trimmed', () => {
		process.env.AINVESTOR_PUBLIC_ORIGIN = 'https://ainvestor.example/'
		process.env.FLY_APP_NAME = 'ainvestor'
		assert.equal(
			resolvePublicOrigin(requestWith({ Host: 'wrong.local' })),
			'https://ainvestor.example',
		)
	})

	it('still works on loopback so local development is possible', () => {
		delete process.env.AINVESTOR_PUBLIC_ORIGIN
		delete process.env.FLY_APP_NAME
		assert.equal(
			resolvePublicOrigin(
				new Request(
					'http://127.0.0.1:44100/.well-known/oauth-protected-resource',
				),
			),
			'http://127.0.0.1:44100',
		)
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

	it('advertises only the body-credential auth GitHub documents', () => {
		// Offering client_secret_basic invites a client to send credentials as a
		// Basic header, which GitHub answers with incorrect_client_credentials.
		assert.deepEqual(metadata.token_endpoint_auth_methods_supported, [
			'client_secret_post',
		])
	})

	it('advertises the refresh grant, so expiring tokens can be renewed', () => {
		// A GitHub OAuth App with "Expire user access tokens" on issues tokens
		// good for 8 hours plus a refresh token. Omitting this grant would let a
		// client conclude no refresh is possible and stop working after 8 hours.
		assert.ok(metadata.grant_types_supported.includes('refresh_token'))
		assert.ok(metadata.grant_types_supported.includes('authorization_code'))
	})

	it('advertises no registration endpoint, so clients use preregistered credentials', () => {
		// Dynamic client registration is not supported: the user registers a
		// GitHub OAuth App and pastes its id and secret into the connector.
		assert.equal('registration_endpoint' in metadata, false)
	})
})
