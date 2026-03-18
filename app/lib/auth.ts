/**
 * GitHub OAuth config helpers.
 * Read at request time so env vars can be set in tests.
 */
export function getClientId() {
	return process.env.GH_CLIENT_ID ?? ''
}

export function getClientSecret() {
	return process.env.GH_CLIENT_SECRET ?? ''
}
