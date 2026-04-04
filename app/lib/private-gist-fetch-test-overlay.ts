import type { EtfEntry } from './gist.ts'
import type { EtfGuideline } from './guidelines.ts'

/**
 * Test-only: when set, `fetchEtfs` / `fetchGuidelines` return these rows for the
 * token and gist id used by {@link signInWithGist} in advice tests (avoids real GitHub).
 */
type PrivateGistFetchOverlay = {
	etfs: EtfEntry[]
	guidelines: EtfGuideline[]
}

let overlay: PrivateGistFetchOverlay | null = null

const TEST_TOKEN = 'test-token'
const TEST_GIST_ID = 'gist-advice-test'

export function setPrivateGistFetchTestOverlay(
	next: PrivateGistFetchOverlay | null,
): void {
	overlay = next
}

export function takePrivateGistFetchTestEtfs(
	token: string,
	gistId: string,
): EtfEntry[] | null {
	if (overlay === null) return null
	if (token !== TEST_TOKEN || gistId !== TEST_GIST_ID) return null
	return overlay.etfs
}

export function takePrivateGistFetchTestGuidelines(
	token: string,
	gistId: string,
): EtfGuideline[] | null {
	if (overlay === null) return null
	if (token !== TEST_TOKEN || gistId !== TEST_GIST_ID) return null
	return overlay.guidelines
}
