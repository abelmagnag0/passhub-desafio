// Dependencies
import type { Cache } from './redis.js'
import type { Db } from '../db/index.js'
import {
  commissionOf,
  currentHour,
  k as series,
  readSummary,
  type DashboardSummary,
  type Window,
} from '../../adapters/analytics/summary.js'

export type { Window }

const TTL = 90 * 86_400
const SAMPLE_CAP = 200

const k = {
  searches: series.searches,
  hits: series.hits,
  routes: series.routes,
  clicks: series.clicks,
  clickedProviders: series.clickedProviders,
  sales: series.sales,
  revenue: series.revenue,
  latency: series.latency,
  routeLatencySum: series.routeLatencySum,
  routeLatencyCount: series.routeLatencyCount,
  partial: series.partial,
  req: series.req,
  provSavings: series.provSavings,
  provLatSample: series.provLatSample,
  strategy: series.strategy,
}

export type InsightEvent =
  | {
      type: 'search'
      route: string
      latencyMs: number
      partial: boolean
      strategy?: string

      providers?: Array<{ name: string; latencyMs: number }>

      savings?: number
    }
  | {
      type: 'cache_hit'
      route: string
    }
  | { type: 'click'; provider: 'a' | 'b' | 'c'; price: number; route: string }
  | { type: 'request'; status: number }

export class InsightsStore {
  constructor(
    private readonly cache: Cache,
    private readonly db: Db,
  ) {}

  async record(event: InsightEvent): Promise<void> {
    try {
      await this.write(event)
    } catch {
    }
  }

  private async write(event: InsightEvent): Promise<void> {
    const hour = currentHour()
    switch (event.type) {
      case 'search': {
        await this.cache.incr(k.searches(hour), TTL)
        await this.cache.zincrby(k.routes(), event.route, 1, TTL)

        await this.cache.hincrby(k.strategy(), event.strategy ?? 'unknown', 1, TTL)

        await this.cache.pushCapped(
          k.latency(),
          String(Math.round(event.latencyMs)),
          SAMPLE_CAP,
          TTL,
        )

        await this.cache.hincrby(
          k.routeLatencySum(),
          event.route,
          Math.round(event.latencyMs),
          TTL,
        )
        await this.cache.hincrby(k.routeLatencyCount(), event.route, 1, TTL)
        if (event.partial) {
          await this.cache.incr(k.partial(hour), TTL)
        }
        if (event.providers) {
          await Promise.all(
            event.providers.map((p) =>
              this.cache.pushCapped(
                k.provLatSample(),
                `${p.name}:${Math.round(p.latencyMs)}`,
                SAMPLE_CAP,
                TTL,
              ),
            ),
          )
        }
        if (event.savings && event.savings > 0) {
          await this.cache.hincrby(
            k.provSavings(),
            'total',
            Math.round(event.savings * 100),
            TTL,
          )
        }
        break
      }
      case 'cache_hit':

        await this.cache.incr(k.searches(hour), TTL)
        await this.cache.incr(k.hits(hour), TTL)
        break
      case 'click':

        await this.cache.incr(k.clicks(hour), TTL)
        await this.cache.hincrby(k.clickedProviders(hour), event.provider, 1, TTL)
        await this.cache.incr(k.sales(), TTL)
        await this.cache.hincrby(
          k.revenue(hour),
          'total',
          Math.round(event.price * commissionOf(event.provider) * 100),
          TTL,
        )
        break
      case 'request':

        await this.cache.incr(
          k.req(
            event.status >= 500 ? '5xx' : event.status >= 400 ? '4xx' : '2xx',
            hour,
          ),
          TTL,
        )
        break
    }
  }

  async summary(window: Window = 24): Promise<DashboardSummary> {
    return readSummary(this.cache, this.db, window)
  }
}
