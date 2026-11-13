// Dependencies
import { describe, it, expect } from 'vitest'
import {
  hourKey,
  readRedis,
  fromPostgres,
  percentile,
} from '../src/adapters/analytics/summary.js'

import type { Cache } from '../src/adapters/cache/redis.js'
import type { Db } from '../src/adapters/db/index.js'

const memoryCache = (seed: Record<string, unknown> = {}) => {
  const store = new Map<string, unknown>(Object.entries(seed))
  const cache = {
    store,
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
    hgetall: async (k: string) => (store.get(k) as Record<string, string>) ?? {},
    list: async (k: string) => (store.get(k) as string[]) ?? [],
    ztop: async (k: string) => {
      const z = (store.get(k) as Array<{ member: string; score: number }>) ?? []
      return [...z].sort((a, b) => b.score - a.score)
    },
  }
  return cache as unknown as Cache & { store: Map<string, unknown> }
}

const dbDesligado = () => ({ enabled: false, insights: async () => ({}) }) as unknown as Db

describe('percentile', () => {
  it('devolve null para série vazia', () => {
    expect(percentile([], 0.5)).toBeNull()
  })

  it('segue a convenção de interpolação mais baixa', () => {
    const serie = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]
    expect(percentile(serie, 0.5)).toBe(5)
    expect(percentile(serie, 0.95)).toBe(9)
    expect(percentile(serie, 1)).toBe(100)
  })

  it('não muta a entrada', () => {
    const serie = [5, 1, 3]
    percentile(serie, 0.5)
    expect(serie).toEqual([5, 1, 3])
  })
})

describe('hourKey', () => {
  it('usa o fuso de São Paulo, não UTC', () => {
    expect(hourKey(new Date('2026-11-12T17:05:00Z'))).toBe('2026-11-12T14')
  })

  it('atravessa a virada de dia local corretamente', () => {
    expect(hourKey(new Date('2026-11-13T02:30:00Z'))).toBe('2026-11-12T23')
  })
})

describe('readRedis', () => {
  it('devolve série vazia (zeros) quando não há dado', async () => {
    const res = await readRedis(memoryCache(), 24)

    expect(res.source).toBe('redis')
    expect(res.buckets).toHaveLength(24)
    expect(res.buckets.every((b) => b.searches === 0)).toBe(true)
    expect(res.totals.searches).toBe(0)

    expect(res.totals.cache_hit_rate).toBeNull()
    expect(res.totals.error_rate).toBeNull()
  })

  it('soma taxa de cache e de problema', async () => {
    const cache = memoryCache()
    const h = hourKey()
    cache.store.set(`ins:searches:${h}`, 10)
    cache.store.set(`ins:hits:${h}`, 4)
    cache.store.set(`ins:partial:${h}`, 1)
    cache.store.set(`ins:c2xx`, 'ignorado')

    const res = await readRedis(cache, 24)
    const atual = res.buckets.at(-1)!

    expect(atual.searches).toBe(10)
    expect(atual.cache_hits).toBe(4)
    expect(res.totals.cache_hit_rate).toBe(40)
    expect(res.totals.partial_rate).toBe(10)
  })

  it('divide erros em 4xx e 5xx e mantém a taxa de erro', async () => {
    const cache = memoryCache()
    const h = hourKey()
    cache.store.set(`ins:req:2xx:${h}`, 90)
    cache.store.set(`ins:req:4xx:${h}`, 8)
    cache.store.set(`ins:req:5xx:${h}`, 2)

    const res = await readRedis(cache, 24)

    expect(res.totals.requests).toEqual({ ok: 90, client_error: 8, server_error: 2 })
    expect(res.totals.error_rate).toBe(10)
  })

  it('agrupa a janela de 7 dias em baldes diários', async () => {
    const cache = memoryCache()
    const h = hourKey()
    cache.store.set(`ins:searches:${h}`, 7)

    const res = await readRedis(cache, 168)

    expect(res.resolution).toBe('dia')
    expect(res.buckets).toHaveLength(7)
    expect(res.buckets.at(-1)!.hour).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(res.totals.searches).toBe(7)
  })

  it('conta vitórias por provider a partir dos cliques', async () => {
    const cache = memoryCache()
    const h = hourKey()
    cache.store.set(`ins:clicked:${h}`, { a: '3', c: '1' })

    const res = await readRedis(cache, 24)
    const porProvider = Object.fromEntries(
      res.providers.map((p) => [p.provider, p.wins]),
    )

    expect(porProvider).toEqual({ a: 3, b: 0, c: 1 })
  })

  it('calcula p50/p95 por provider sem confundir os prefixos', async () => {
    const cache = memoryCache()
    cache.store.set('ins:provider_latency_sample', [
      'provider-a:100',
      'provider-a:200',
      'provider-b:900',
    ])

    const res = await readRedis(cache, 24)
    const a = res.providers.find((p) => p.provider === 'a')!
    const b = res.providers.find((p) => p.provider === 'b')!

    expect(a.latency_p50).toBe(100)
    expect(b.latency_p50).toBe(900)
  })
})

describe('fromPostgres', () => {
  it('devolve null sem volume — o chamador cai para o Redis', () => {
    expect(fromPostgres({ volume: [] }, 24)).toBeNull()
  })

  it('converte a série em hora local e agrupa 7d por dia', () => {
    const raw = {
      volume: [
        { hour: '2026-11-12T15:00:00.000Z', searches: 5, partial: 1 },
        { hour: '2026-11-12T17:00:00.000Z', searches: 2, partial: 0 },
      ],
      totals: { total_searches: 7, clicks: 3, cache_hits: 2 },
      routes: [{ route: 'GRU-GIG', searches: 7, avg_latency: 120 }],
      providers: [{ provider: 'a', wins: 3, commission: 1 }],
    }

    const hora = fromPostgres(raw, 24)!

    expect(hora.resolution).toBe('hora')
    expect(hora.buckets).toHaveLength(24)
    expect(hora.buckets.map((b) => b.hour)).toEqual(
      [...hora.buckets.map((b) => b.hour)].sort(),
    )
    const comBusca = hora.buckets.filter((b) => b.searches > 0)

    expect(comBusca.map((b) => b.hour)).toEqual(['2026-11-12T12', '2026-11-12T14'])
    expect(hora.totals.searches).toBe(7)

    const dia = fromPostgres(raw, 168)!
    expect(dia.resolution).toBe('dia')
    expect(dia.buckets.map((b) => b.hour)).toContain('2026-11-12')
    expect(
      dia.buckets.find((b) => b.hour === '2026-11-12')!.searches,
    ).toBe(7)
  })
})

describe('reset', () => {
  it('24h e 7d somam só o que está dentro da janela', async () => {
    const cache = memoryCache()
    const hora = (hAtras: number) => {
      const d = new Date(Date.now() - hAtras * 3_600_000)
      return hourKey(d)
    }
    cache.store.set(`ins:searches:${hora(1)}`, 3)
    cache.store.set(`ins:req:2xx:${hora(1)}`, 5)
    cache.store.set(`ins:searches:${hora(30)}`, 40)
    cache.store.set(`ins:req:2xx:${hora(30)}`, 50)
    cache.store.set(`ins:req:4xx:${hora(30)}`, 2)

    const dia = await readRedis(cache, 24)
    expect(dia.totals.searches).toBe(3)
    expect(dia.totals.requests.ok).toBe(5)

    const semana = await readRedis(cache, 168)
    expect(semana.totals.searches).toBe(43)
    expect(semana.totals.requests.ok).toBe(55)
    expect(semana.totals.requests.client_error).toBe(2)
  })

  it('o agregador cai no Redis (com totais corretos) quando o banco está fora', async () => {
    const { readSummary } = await import('../src/adapters/analytics/summary.js')
    const cache = memoryCache()
    cache.store.set(`ins:searches:${hourKey()}`, 2)
    const res = await readSummary(cache, dbDesligado(), 24)
    expect(res.source).toBe('redis')
    expect(res.totals.searches).toBe(2)
  })
})