import { createHash } from 'node:crypto'

/**
 * A bounded cache keyed by a GitHub token.
 *
 * Two properties matter enough to be shared rather than repeated per caller:
 *
 * - Entries are keyed by a **hash** of the token, never the token itself. They
 *   outlive the request that created them, and a heap dump should not hand
 *   anyone a usable credential.
 * - Eviction is **least-recently-used**. A `Map` iterates in insertion order, so
 *   re-inserting on every hit is all that takes; without it a long-lived entry
 *   is evicted no matter how hot it is.
 *
 * Callers decide what to store and what never to store — a failed lookup, for
 * one, so a transient GitHub error cannot lock a caller out for the process
 * lifetime.
 */
export function createTokenCache<Value>(maxEntries: number) {
	const entries = new Map<string, Value>()

	function keyFor(token: string): string {
		return createHash('sha256').update(token).digest('hex')
	}

	return {
		get(token: string): Value | undefined {
			const key = keyFor(token)
			const cached = entries.get(key)
			if (cached === undefined) return undefined
			entries.delete(key)
			entries.set(key, cached)
			return cached
		},

		set(token: string, value: Value): void {
			const key = keyFor(token)
			if (!entries.has(key) && entries.size >= maxEntries) {
				const oldest = entries.keys().next()
				if (!oldest.done) entries.delete(oldest.value)
			}
			entries.delete(key)
			entries.set(key, value)
		},

		delete(token: string): void {
			entries.delete(keyFor(token))
		},

		clear(): void {
			entries.clear()
		},
	}
}
