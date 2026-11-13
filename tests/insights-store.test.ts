import { describe, expect, it } from 'vitest'
import { InsightsStore } from '../src/adapters/cache/insights-store.js'
import { hourKey, k } from '../src/adapters/analytics/summary.js'
import type { Cache } from '../src/adapters/cache/redis.js'
import type { Db } from '../src/adapters/db/index.js'

const fakeCache = () => {
  const store = new Map<string, number>()
  return {
    store,
    incr: async (key: string) => {
      store.set(key, (store.get(key) ?? 0) + 1)
    },
    hincrby: async () => undefined,
    zincrby: async () => undefined,
    pushCapped: async () => undefined,
  } as unknown as Cache & { store: Map<string, number> }
}

const db = { enabled: false } as unknown as Db

describe('contadores de insight', () => {

  it('um HIT conta como busca e como acerto', async () => {
    const cache = fakeCache()
    const store = new InsightsStore(cache, db)
    const hour = hourKey()

    await store.record({ type: 'cache_hit', route: 'GRU → GIG' })

    expect(cache.store.get(k.searches(hour))).toBe(1)
    expect(cache.store.get(k.hits(hour))).toBe(1)
  })

  it('a taxa de acerto nunca passa de 100%', async () => {
    const cache = fakeCache()
    const store = new InsightsStore(cache, db)
    const hour = hourKey()

    await store.record({ type: 'search', route: 'GRU → GIG', latencyMs: 10, partial: false })
    await store.record({ type: 'cache_hit', route: 'GRU → GIG' })
    await store.record({ type: 'cache_hit', route: 'CGH → SDU' })

    const hits = cache.store.get(k.hits(hour))!
    const searches = cache.store.get(k.searches(hour))!
    expect(hits).toBe(2)
    expect(searches).toBe(3)
    expect(hits / searches).toBeLessThanOrEqual(1)
  })
})
