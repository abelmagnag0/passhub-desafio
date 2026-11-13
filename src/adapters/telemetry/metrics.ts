// Dependencies
import {
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
  register,
} from 'prom-client'

collectDefaultMetrics({ register })

export const searchRequests = new Counter({
  name: 'aggregator_search_requests_total',
  help: 'buscas recebidas',
  labelNames: ['strategy', 'partial'],
  registers: [register],
})

export const cacheHits = new Counter({
  name: 'aggregator_cache_hits_total',
  help: 'buscas servidas do cache',
  registers: [register],
})

export const providerLatency = new Histogram({
  name: 'aggregator_provider_latency_seconds',
  help: 'latência por provider',
  labelNames: ['provider', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3],
  registers: [register],
})

export const breakerGauge = new Gauge({
  name: 'aggregator_breaker_state',
  help: '0 closed, 1 half-open, 2 open',
  labelNames: ['provider'],
  registers: [register],
})

export async function metricsText(): Promise<string> {
  return register.metrics()
}
