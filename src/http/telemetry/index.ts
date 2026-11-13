// Dependencies
import type { FastifyInstance } from 'fastify'

// Container
import type { Deps } from '../../container.js'

// Adapters
import { breakerState } from '../../adapters/http/providers/client.js'
import { TTL_SECONDS } from '../../adapters/cache/redis.js'
import { hourKey, k } from '../../adapters/analytics/summary.js'

export const telemetryRoutes = (app: FastifyInstance, deps: Deps): void => {
  const { cache } = deps

  app.get(
    '/telemetry/data',
    {
      schema: {
        tags: ['telemetria'],
        summary: 'Cache e métricas para a tela de telemetria',
        response: {
          200: {
            type: 'object',
            properties: {
              cache: {
                type: 'object',
                properties: {
                  ttlSeconds: { type: 'integer' },
                  entries: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        key: { type: 'string' },
                        origin: { type: 'string' },
                        destination: { type: 'string' },
                        date: { type: 'string' },
                        strategy: { type: 'string' },
                        ttl: { type: 'integer' },
                        remainingPct: { type: 'integer' },
                      },
                    },
                  },
                },
              },
              providers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    breaker: { type: 'string' },
                  },
                },
              },
              hits: { type: 'integer' },
              searches: { type: 'integer' },
              hitRate: { type: ['number', 'null'] },
              entryCount: { type: 'integer' },
              strategies: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      const inventoried = await cache.inventory().catch(() => [])

      const entries = inventoried
        .map(({ key, ttl }) => {

          const [prefix, origin, destination, date, strategy] = key.split(':')
          if (prefix !== 'search') return null
          return {
            key,
            origin: origin ?? '',
            destination: destination ?? '',
            date: date ?? '',
            strategy: strategy ?? '',
            ttl,
            remainingPct: Math.max(
              0,
              Math.round((ttl / TTL_SECONDS) * 100),
            ),
          }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => b.ttl - a.ttl)

      const hour = hourKey()
      const [hits, searches, strategies] = await Promise.all([
        cache.get<number>(k.hits(hour)).catch(() => 0),
        cache.get<number>(k.searches(hour)).catch(() => 0),
        cache.hgetall(k.strategy()).catch(() => ({})),
      ])
      const nHits = Number(hits ?? 0)
      const nSearches = Number(searches ?? 0)

      return {
        cache: { ttlSeconds: TTL_SECONDS, entries },
        providers: (['a', 'b', 'c'] as const).map((id) => ({
          name: `provider-${id}`,
          breaker: breakerState(id),
        })),
        hits: nHits,
        searches: nSearches,
        entryCount: entries.length,

        strategies: Object.entries(strategies ?? {})
          .map(([name, total]) => ({ name, total: Number(total) }))
          .sort((a, b) => b.total - a.total),
        hitRate:
          nSearches > 0 ? Math.round((nHits / nSearches) * 1000) / 10 : null,
      }
    },
  )
}