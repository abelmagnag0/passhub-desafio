// Config
import { providers, providerUrl } from '../../../config/index.js'
import { adapters } from '../../../core/search/adapters/index.js'
import type { FlightOffer } from '../../../core/search/types.js'
import type { ProviderMeta } from '../../../core/search/search.types.js'
import { fetchProvider, breakerState } from './client.js'
import { providerLatency } from '../../telemetry/metrics.js'
import { withSpan } from '../../telemetry/tracing.js'

type ProviderId = 'a' | 'b' | 'c'

export type ProviderResult = {
  offers: FlightOffer[]
  meta: ProviderMeta
}

export const fanOut = async (
  body: { origin: string; destination: string; date: string },
): Promise<ProviderResult[]> => {
  const settled = await Promise.allSettled(
    Object.values(providers).map(async (provider) => {
      const start = Date.now()
      const id = provider.name.at(-1) as ProviderId
      const meta: ProviderMeta = {
        name: provider.name,
        status: 'ok',
        latencyMs: 0,
        offers: 0,
        issues: [],
      }

      return withSpan(
        `provider.${id}.search`,
        { 'provider.id': id, 'provider.name': provider.name },
        async (span) => {
          try {
            const payload = await fetchProvider({
              url: `${providerUrl(id)}/provider-${id}/search`,
              body,
              provider: id,
            })
            const result = adapters[id](payload, body.date)

            meta.latencyMs = Date.now() - start
            meta.offers = result.offers.length
            meta.issues = result.issues
            providerLatency.observe(
              { provider: provider.name, status: 'ok' },
              meta.latencyMs / 1000,
            )
            span.setAttributes({
              'provider.offers': meta.offers,
              'provider.latency_ms': meta.latencyMs,
              'provider.status': 'ok',
            })

            return { offers: result.offers, meta } satisfies ProviderResult
          } catch (err) {
            meta.latencyMs = Date.now() - start
            meta.status =
              breakerState(id) === 'open' ? 'breaker-open' : 'failed'
            meta.issues = [err instanceof Error ? err.message : String(err)]
            providerLatency.observe(
              { provider: provider.name, status: meta.status },
              meta.latencyMs / 1000,
            )

            span.setAttributes({
              'provider.status': meta.status,
              'provider.latency_ms': meta.latencyMs,
              'provider.error': meta.issues[0] ?? '',
            })

            return { offers: [], meta } satisfies ProviderResult
          }
        },
      )
    }),
  )

  return settled.flatMap(s =>
    s.status === 'fulfilled'
      ? [s.value]
      : [],
  )
}