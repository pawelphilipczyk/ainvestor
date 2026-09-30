import type { EtfEntry } from './gist.ts'
import type { EtfGuideline } from './guidelines.ts'

/**
 * Test-only in-memory stand-in for a user's private data gist.
 *
 * When set, `fetchEtfs` / `saveEtfs` / `fetchGuidelines` / `saveGuidelines`
 * read and write **here** instead of GitHub, for the token and gist id below.
 * Route tests need the writes as much as the reads: before guest mode was
 * removed they exercised add/remove flows through the in-memory guest state,
 * and a signed-in session has no such fallback.
 */
type PrivateGistTestStore = {
	etfs: EtfEntry[]
	guidelines: EtfGuideline[]
}

let store: PrivateGistTestStore | null = null

export const TEST_TOKEN = 'test-token'
export const TEST_GIST_ID = 'gist-advice-test'

function handles(token: string, gistId: string): boolean {
	return store !== null && token === TEST_TOKEN && gistId === TEST_GIST_ID
}

export function setPrivateGistTestStore(
	next: PrivateGistTestStore | null,
): void {
	store = next
}

/**
 * Installs an empty store only when none is set, so a caller that seeded rows
 * first keeps them. `setPrivateGistTestStore` still replaces outright.
 */
export function ensurePrivateGistTestStore(): void {
	if (store === null) store = { etfs: [], guidelines: [] }
}

export function takePrivateGistTestEtfs(
	token: string,
	gistId: string,
): EtfEntry[] | null {
	if (!handles(token, gistId) || store === null) return null
	return store.etfs
}

export function takePrivateGistTestGuidelines(
	token: string,
	gistId: string,
): EtfGuideline[] | null {
	if (!handles(token, gistId) || store === null) return null
	return store.guidelines
}

/** True when the write landed here, so the caller must not reach GitHub. */
export function putPrivateGistTestEtfs(
	token: string,
	gistId: string,
	etfs: EtfEntry[],
): boolean {
	if (!handles(token, gistId) || store === null) return false
	store.etfs = etfs
	return true
}

/** True when the write landed here, so the caller must not reach GitHub. */
export function putPrivateGistTestGuidelines(
	token: string,
	gistId: string,
	guidelines: EtfGuideline[],
): boolean {
	if (!handles(token, gistId) || store === null) return false
	store.guidelines = guidelines
	return true
}
