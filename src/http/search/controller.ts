// Dependencies
import { randomUUID } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'

// Container
import type { Deps } from '../../container.js'

// Config
import { providers } from '../../config/index.js'
import type { SearchResponse } from '../../core/search/search.types.js'
import { consolidate } from '../../core/search/service.js'
import { strategySchema, type Strategy } from '../../core/search/selection.js'
import { searchKey } from '../../adapters/cache/redis.js'
import { breakerState } from '../../adapters/http/providers/client.js'
import {
  searchRequests,
  cacheHits,
  breakerGauge,
} from '../../adapters/telemetry/metrics.js'
import { withSpan } from '../../adapters/telemetry/tracing.js'

// Schema
import { searchBody } from './schema.js'

const CACHE_HEADER = 'x-search-cache'

export const createSearchController = (deps: Deps) => {
  const { cache, db, insights, agentHash, fanOut } = deps

  return async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = searchBody.safeParse(req.body)

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'payload inválido',
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const { origin, destination, date } = parsed.data
    const strategy: Strategy = strategySchema
      .catch('commission_guarded')
      .parse(req.headers['x-strategy'])
    const route = `${origin} → ${destination}`
    const key = searchKey(origin, destination, date, strategy)
    const agentHashId = agentHash.of(req.ip)

    const cached = await withSpan(
      'cache.get',
      { 'cache.key': key, 'cache.system': 'redis' },
      async (span) => {
        const hit = await cache.get<SearchResponse>(key)
        span.setAttribute('cache.hit', Boolean(hit))
        return hit
      },
    )

    if (cached) {
      cacheHits.inc()
      await insights.record({ type: 'cache_hit', route })

      const hitId = await db.recordSearch({
        origin,
        destination,
        date,
        strategy,
        partial: cached.meta.partial,
        latencyMs: 0,
        cacheHit: true,
        agentHash: agentHashId,
        flights: cached.flights,
      })

      const served = {
        ...cached,

        requestId: hitId ?? cached.requestId,
        meta: { ...cached.meta, cache: 'HIT' as const },
      }
      return reply.header(CACHE_HEADER, 'HIT').send(served)
    }

    const results = await fanOut({ origin, destination, date })
    const metas = results.map(r => r.meta)
    const offers = results.flatMap(r => r.offers)
    const okCount = metas.filter(m => m.status === 'ok').length
    const requestId = randomUUID()

    const response: SearchResponse = {
      requestId,
      request: { origin, destination, date },
      flights: consolidate(offers, strategy, providers),
      meta: {
        providers: metas,
        partial: okCount < 3,
        cache: 'MISS',
        strategy,
        generatedAt: new Date().toISOString(),
      },
    }

    await withSpan(
      'cache.set',
      { 'cache.key': key, 'cache.system': 'redis' },
      () => cache.set(key, response),
    )
    searchRequests.inc({ strategy, partial: String(response.meta.partial) })

    const totalLatency = metas.reduce((acc, m) => acc + m.latencyMs, 0)
    await insights.record({
      type: 'search',
      route,
      latencyMs: totalLatency,
      partial: response.meta.partial,
      strategy,
      providers: metas.map((m) => ({ name: m.name, latencyMs: m.latencyMs })),

      savings: response.flights.reduce(
        (a, f) => a + Math.max(0, f.savings),
        0,
      ),
    })

    const searchId = await withSpan(
      'db.record_search',
      { 'db.system': 'postgres', 'search.strategy': strategy },
      () =>
        db.recordSearch({
          origin,
          destination,
          date,
          strategy,
          partial: response.meta.partial,
          latencyMs: totalLatency,
          agentHash: agentHashId,
          flights: response.flights,
        }),
    ).catch(() => null)

    if (searchId) {
      response.requestId = searchId
    }

    for (const id of ['a', 'b', 'c'] as const) {
      const state = breakerState(id)
      breakerGauge.set(
        { provider: `provider-${id}` },
        state === 'open' ? 2 : state === 'half-open' ? 1 : 0,
      )
    }

    req.log.info(
      {
        origin,
        destination,
        date,
        strategy,
        flights: response.flights.length,
        partial: response.meta.partial,
      },
      'busca concluída',
    )

    return reply.header(CACHE_HEADER, 'MISS').send(response)
  }
}
