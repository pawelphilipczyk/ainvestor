/**
 * @deprecated Use `resetTestSessionCookieJar` — this clears the in-memory test
 * cookie jar (and test-only guest guideline store), not ETF rows only.
 */
export {
	resetTestSessionCookieJar,
	resetTestSessionCookieJar as resetEtfEntries,
} from '../../lib/test-session-fetch.ts'
