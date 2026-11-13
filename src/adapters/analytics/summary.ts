import type { Cache } from '../cache/redis.js'
import type { Db } from '../db/index.js'

export type Window = 24 | 168

export type Bucket = {
  hour: string
  searches: number
  clicks: number
  cache_hits: number
  partial: number
  avg_latency: number | null
  revenue: number
  errors: number
}

export type DashboardSummary = {
  source: 'postgres' | 'redis'
  window: Window

  resolution: 'hora' | 'dia'

  buckets: Bucket[]
  routes: Array<{
    route: string
    searches: number
    avg_latency: number | null
    revenue: number | null
    conversion: number | null
  }>
  providers: Array<{
    provider: string
    wins: number
    latency_p50: number | null
    latency_p95: number | null
    savings: number | null
    commission: number | null

    algorithm_wins?: number
  }>
  totals: {
    searches: number
    clicks: number
    cache_hits: number
    cache_hit_rate: number | null
    partial: number
    partial_rate: number | null
    clicks_per_search: number | null
    projected_revenue: number
    commission_per_search: number | null
    p50_ms: number | null
    p95_ms: number | null
    avg_latency_ms: number | null
    requests: { ok: number; client_error: number; server_error: number }
    error_rate: number | null
    savings: number
  }
}

const num = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null

const avg = (sum: number, count: number) =>
  count > 0 ? Math.round(sum / count) : null

export const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))
  return Math.round(sorted[idx]!)
}

const FUSO_NEGOCIO = 'America/Sao_Paulo'

const fmtHora = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

export const hourKey = (d = new Date()): string => {
  const p = fmtHora.formatToParts(d)
  const get = (t: string) => p.find((x) => x.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}`
}

export const currentHour = () => hourKey()

const hoursBack = (n: number, now = new Date()): string[] => {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(hourKey(new Date(now.getTime() - i * 3_600_000)))
  }
  return out
}

const daysBack = (n: number, now = new Date()): string[] => {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(hourKey(new Date(now.getTime() - i * 86_400_000)).slice(0, 10))
  }
  return out
}

const COMMISSION: Record<string, number> = { a: 0.01, b: 0.015, c: 0.02 }
export const commissionOf = (provider: string) => COMMISSION[provider] ?? 0

export const k = {
  searches: (hour: string) => `ins:searches:${hour}`,
  hits: (hour: string) => `ins:hits:${hour}`,
  clicks: (hour: string) => `ins:clicks:${hour}`,
  revenue: (hour: string) => `ins:revenue:${hour}`,
  clickedProviders: (hour: string) => `ins:clicked:${hour}`,
  partial: (hour: string) => `ins:partial:${hour}`,
  req: (bucket: '2xx' | '4xx' | '5xx', hour: string) =>
    `ins:req:${bucket}:${hour}`,
  routes: () => 'ins:routes',
  routeLatencySum: () => 'ins:route_latency_sum',
  routeLatencyCount: () => 'ins:route_latency_count',
  latency: () => 'ins:latency',
  provLatSample: () => 'ins:provider_latency_sample',
  provSavings: () => 'ins:provider_savings',
  sales: () => 'ins:sales',
  strategy: () => 'ins:strategy',
}

export const readRedis = async (
  cache: Cache,
  window: Window,
): Promise<DashboardSummary> => {
  const resolution: 'hora' | 'dia' = window === 24 ? 'hora' : 'dia'

  const hours = hoursBack(168)

  const hourReads = await Promise.all(
    hours.map(async (h) => {
      const [searches, hits, clicks, partial, revenue, ok, c4, c5] =
        await Promise.all([
          cache.get<number>(k.searches(h)),
          cache.get<number>(k.hits(h)),
          cache.get<number>(k.clicks(h)),
          cache.get<number>(k.partial(h)),
          cache.hgetall(k.revenue(h)),
          cache.get<number>(k.req('2xx', h)),
          cache.get<number>(k.req('4xx', h)),
          cache.get<number>(k.req('5xx', h)),
        ])
      return {
        hour: h,
        searches: num(searches),
        clicks: num(clicks),
        cache_hits: num(hits),
        partial: num(partial),
        revenue: num(revenue.total) / 100,
        errors: num(c4) + num(c5),
        ok: num(ok),
        c4: num(c4),
        c5: num(c5),
      }
    }),
  )

  const [
    routesTop,
    latencies,
    routeSum,
    routeCount,
    provSample,
    provSavings,
    clicksByProvider,
  ] = await Promise.all([
    cache.ztop(k.routes(), 50),
    cache.list(k.latency(), 200),
    cache.hgetall(k.routeLatencySum()),
    cache.hgetall(k.routeLatencyCount()),
    cache.list(k.provLatSample(), 200),
    cache.hgetall(k.provSavings()),

    Promise.all(
      hoursBack(window).map((h) => cache.hgetall(k.clickedProviders(h))),
    ),
  ])

  const wins: Record<string, number> = {}
  for (const h of clicksByProvider) {
    for (const [provider, n] of Object.entries(h)) {
      wins[provider] = (wins[provider] ?? 0) + num(n)
    }
  }

  let buckets: Bucket[]
  if (resolution === 'hora') {
    buckets = hourReads.slice(-24).map((r) => ({
      hour: `${r.hour}:00`,
      searches: r.searches,
      clicks: r.clicks,
      cache_hits: r.cache_hits,
      partial: r.partial,
      revenue: Math.round(r.revenue * 100) / 100,
      errors: r.errors,
      avg_latency: null,
    }))
  } else {
    const days = daysBack(7)
    buckets = days.map((day) => {
      const rows = hourReads.filter((r) => r.hour.startsWith(day))
      const sum = (pick: (r: (typeof rows)[number]) => number) =>
        rows.reduce((a, r) => a + pick(r), 0)
      return {
        hour: day,
        searches: sum((r) => r.searches),
        clicks: sum((r) => r.clicks),
        cache_hits: sum((r) => r.cache_hits),
        partial: sum((r) => r.partial),
        revenue: Math.round(sum((r) => r.revenue) * 100) / 100,
        errors: sum((r) => r.errors),
        avg_latency: null,
      }
    })
  }

  const samples: Record<string, number[]> = {}
  for (const raw of provSample) {
    const at = String(raw).lastIndexOf(':')
    if (at < 1) continue
    const name = String(raw).slice(0, at)
    const ms = Number(String(raw).slice(at + 1))
    if (!Number.isFinite(ms)) continue
    ;(samples[name] ??= []).push(ms)
  }

  const horasDaJanela = new Set(
    resolution === 'hora' ? buckets.map((b) => b.hour.slice(0, 13)) : [],
  )
  const diasDaJanela = new Set(buckets.map((b) => b.hour.slice(0, 10)))
  const inWindow = hourReads.filter((r) =>
    resolution === 'hora'
      ? horasDaJanela.has(r.hour)
      : diasDaJanela.has(r.hour.slice(0, 10)),
  )
  const totalSearches = buckets.reduce((a, b) => a + b.searches, 0)
  const totalHits = buckets.reduce((a, b) => a + b.cache_hits, 0)
  const totalClicks = buckets.reduce((a, b) => a + b.clicks, 0)
  const totalPartial = buckets.reduce((a, b) => a + b.partial, 0)
  const totalOk = inWindow.reduce((a, r) => a + r.ok, 0)
  const totalC4 = inWindow.reduce((a, r) => a + r.c4, 0)
  const totalC5 = inWindow.reduce((a, r) => a + r.c5, 0)
  const revenue = buckets.reduce((a, b) => a + b.revenue, 0)
  const latencyValues = latencies
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
  const savings = num(provSavings.total) / 100

  return {
    source: 'redis',
    window,
    resolution,
    buckets,
    routes: routesTop.slice(0, 8).map((r) => {
      const count = num(routeCount[r.member])
      return {
        route: r.member,
        searches: Math.round(r.score),
        avg_latency:
          count > 0 ? Math.round(num(routeSum[r.member]) / count) : null,
        revenue: null,
        conversion: null,
      }
    }),
    providers: ['a', 'b', 'c'].map((provider) => ({
      provider,
      wins: wins[provider] ?? 0,
      latency_p50: percentile(samples[`provider-${provider}`] ?? [], 0.5),
      latency_p95: percentile(samples[`provider-${provider}`] ?? [], 0.95),
      savings: null,
      commission: commissionOf(provider),
    })),
    totals: {
      searches: totalSearches,
      clicks: totalClicks,
      cache_hits: totalHits,
      cache_hit_rate: pct(totalHits, totalSearches),
      partial: totalPartial,
      partial_rate: pct(totalPartial, totalSearches),
      clicks_per_search: totalSearches
        ? Math.round((totalClicks / totalSearches) * 1000) / 1000
        : null,
      projected_revenue: Math.round(revenue * 100) / 100,
      commission_per_search: totalClicks
        ? Math.round((revenue / totalClicks) * 100) / 100
        : null,
      p50_ms: percentile(latencyValues, 0.5),
      p95_ms: percentile(latencyValues, 0.95),
      avg_latency_ms: avg(
        latencyValues.reduce((a, b) => a + b, 0),
        latencyValues.length,
      ),
      requests: { ok: totalOk, client_error: totalC4, server_error: totalC5 },
      error_rate: pct(totalC4 + totalC5, totalOk + totalC4 + totalC5),
      savings: Math.round(savings * 100) / 100,
    },
  }
}

const emptyBucket = (hour: string): Bucket => ({
  hour,
  searches: 0,
  clicks: 0,
  cache_hits: 0,
  partial: 0,
  avg_latency: null,
  revenue: 0,
  errors: 0,
})

const densifyHoras = (rows: Bucket[]): Bucket[] => {
  const byHour = new Map(rows.map((b) => [b.hour, b]))
  return hoursBack(24).map((h) => byHour.get(h) ?? emptyBucket(h))
}

const densifyDias = (rows: Bucket[]): Bucket[] => {
  const byDay = new Map(rows.map((b) => [b.hour.slice(0, 10), b]))
  return daysBack(7).map((key) => byDay.get(key) ?? emptyBucket(key))
}

export const fromPostgres = (
  raw: Record<string, unknown>,
  window: Window,
): DashboardSummary | null => {
  const volume = (raw.volume as Array<Record<string, unknown>>) ?? []
  const totals = (raw.totals as Record<string, unknown>) ?? {}
  if (volume.length === 0) return null

  const resolution: 'hora' | 'dia' = window === 24 ? 'hora' : 'dia'
  const buckets: Bucket[] = volume.map((v) => {
    const iso = String(v.hour)

    const local = hourKey(new Date(iso))
    return {
      hour: resolution === 'hora' ? local : local.slice(0, 10),
      searches: num(v.searches),
      clicks: num(v.clicks),
      cache_hits: num(v.cache_hits),
      partial: num(v.partial),
      avg_latency: v.avg_latency == null ? null : num(v.avg_latency),
      revenue: 0,
      errors: 0,
    }
  })

  const grouped: Bucket[] =
    resolution === 'hora'
      ? densifyHoras(buckets)
      : densifyDias(
          Object.values(
            buckets.reduce<Record<string, Bucket>>((acc, b) => {
              const key = b.hour.slice(0, 10)
              const cur = (acc[key] ??= emptyBucket(key))
              cur.searches += b.searches
              cur.partial += b.partial
              return acc
            }, {}),
          ),
        )

  const totalSearches = grouped.reduce((a, b) => a + b.searches, 0)
  const cacheHits = num(totals.cache_hits)

  return {
    source: 'postgres',
    window,
    resolution,
    buckets: grouped,
    routes: ((raw.routes as Array<Record<string, unknown>>) ?? [])
      .slice(0, 8)
      .map((r) => ({
        route: String(r.route),
        searches: num(r.searches),
        avg_latency: r.avg_latency == null ? null : num(r.avg_latency),
        revenue: null,
        conversion: null,
      })),

    providers: ['a', 'b', 'c'].map((provider) => {
      const row = ((raw.providers as Array<Record<string, unknown>>) ?? []).find(
        (p) => String(p.provider) === provider,
      )
      return {
        provider,
        wins: num(row?.clicks),
        algorithm_wins: num(row?.wins),
        latency_p50: null,
        latency_p95: null,
        savings: null,
        commission: row?.commission == null ? null : num(row.commission),
      }
    }),
    totals: {
      searches: totalSearches,
      clicks: num(totals.total_clicks),
      cache_hits: cacheHits,
      cache_hit_rate:
        totals.cache_hit_rate == null ? null : num(totals.cache_hit_rate),
      partial: grouped.reduce((a, b) => a + b.partial, 0),
      partial_rate: pct(
        grouped.reduce((a, b) => a + b.partial, 0),
        totalSearches,
      ),
      clicks_per_search:
        totalSearches > 0
          ? Math.round((num(totals.total_clicks) / totalSearches) * 1000) / 1000
          : null,
      projected_revenue: num(totals.projected_revenue),
      commission_per_search:
        num(totals.total_clicks) > 0
          ? Math.round(
              (num(totals.projected_revenue) / num(totals.total_clicks)) * 100,
            ) / 100
          : null,
      p50_ms: totals.p50_ms == null ? null : num(totals.p50_ms),
      p95_ms: totals.p95_ms == null ? null : num(totals.p95_ms),
      avg_latency_ms:
        totals.avg_latency_ms == null ? null : num(totals.avg_latency_ms),
      requests: { ok: 0, client_error: 0, server_error: 0 },
      error_rate: null,
      savings: 0,
    },
  }
}

const merge = (
  pg: DashboardSummary,
  redis: DashboardSummary,
): DashboardSummary => {
  const t = pg.totals
  const r = redis.totals
  const requests = pg.totals.requests.ok + pg.totals.requests.client_error + pg.totals.requests.server_error
    ? pg.totals.requests
    : r.requests
  const totalReq = requests.ok + requests.client_error + requests.server_error

  return {
    ...pg,
    source: 'postgres',

    providers: pg.providers.map((p) => ({
      ...p,

      latency_p50:
        p.latency_p50 ??
        redis.providers.find((x) => x.provider === p.provider)?.latency_p50 ??
        null,
      latency_p95:
        p.latency_p95 ??
        redis.providers.find((x) => x.provider === p.provider)?.latency_p95 ??
        null,
    })),
    totals: {
      ...t,
      cache_hit_rate: t.cache_hit_rate ?? r.cache_hit_rate,
      savings: r.savings,
      requests,
      error_rate:
        totalReq > 0
          ? Math.round(
              ((requests.client_error + requests.server_error) / totalReq) *
                1000,
            ) / 10
          : null,
    },
  }
}

export const readSummary = async (
  cache: Cache,
  db: Db,
  window: Window,
): Promise<DashboardSummary> => {
  const redis = await readRedis(cache, window)
  if (db.enabled) {
    try {
      const pg = fromPostgres(await db.insights(), window)
      if (pg) return merge(pg, redis)
    } catch {
    }
  }
  return redis
}