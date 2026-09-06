import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createTokenCache } from './token-cache.ts'

describe('token cache', () => {
	it('returns what was stored for that token and nothing for another', () => {
		const cache = createTokenCache<string>(4)
		cache.set('token-a', 'gist-a')
		assert.equal(cache.get('token-a'), 'gist-a')
		assert.equal(cache.get('token-b'), undefined)
	})

	it('evicts the least recently used entry once the bound is reached', () => {
		const cache = createTokenCache<string>(2)
		cache.set('first', '1')
		cache.set('second', '2')
		cache.set('third', '3')

		assert.equal(cache.get('first'), undefined)
		assert.equal(cache.get('second'), '2')
		assert.equal(cache.get('third'), '3')
	})

	it('spares an entry that is still being read', () => {
		// Insertion order alone would evict `first` here even though it is the
		// hottest entry, so a busy caller would re-fetch on every request.
		const cache = createTokenCache<string>(2)
		cache.set('first', '1')
		cache.set('second', '2')
		cache.get('first')
		cache.set('third', '3')

		assert.equal(cache.get('first'), '1')
		assert.equal(cache.get('second'), undefined)
	})

	it('overwrites in place rather than spending a slot', () => {
		const cache = createTokenCache<string>(2)
		cache.set('first', '1')
		cache.set('first', 'again')
		cache.set('second', '2')

		assert.equal(cache.get('first'), 'again')
		assert.equal(cache.get('second'), '2')
	})

	it('forgets a single token, and all of them', () => {
		const cache = createTokenCache<string>(4)
		cache.set('first', '1')
		cache.set('second', '2')

		cache.delete('first')
		assert.equal(cache.get('first'), undefined)
		assert.equal(cache.get('second'), '2')

		cache.clear()
		assert.equal(cache.get('second'), undefined)
	})
})
