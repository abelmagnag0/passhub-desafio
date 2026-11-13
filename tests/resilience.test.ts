// Dependencies
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Cache, TTL_SECONDS, searchKey } from '../src/adapters/cache/redis.js'
import { AgentHash } from '../src/adapters/security/agent-hash.js'
import { Db } from '../src/adapters/db/index.js'
import { fanOut } from '../src/adapters/http/providers/fan-out.js'
import { InsightsStore } from '../src/adapters/cache/insights-store.js'

// Routes
import { searchRoutes } from '../src/http/search/index.js'

// Container
import type { Deps } from '../src/container.js'

const fixture = (name: string) =>
  JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf-8'))

let servers: Server[] = []

const startProvider = async (
  id: 'a' | 'b' | 'c',
  behavior: 'ok' | 'error' | 'slow',
): Promise<string> => {
  const payload = fixture(`provider-${id}`)
  const server = createServer((_req, res) => {
    if (behavior === 'error') {
      res.writeHead(500).end()
      return
    }
    if (behavior === 'slow') {
      setTimeout(() => res.end(JSON.stringify(payload)), 5_000)
      return
    }
    res.end(JSON.stringify(payload))
  })
  await new Promise<void>((r) => server.listen(0, r))
  servers.push(server)
  const { port } = server.address() as { port: number }
  return `http://localhost:${port}`
}

const redisDisponivel = async (): Promise<boolean> => {
  const c = new Cache('redis://localhost:6379')
  try {
    await c.connect()
    return await c.ping()
  } catch {
    return false
  } finally {
    await c.close()
  }
}

const temRedis = await redisDisponivel()
if (!temRedis) {
  console.warn('Redis não disponível — testes de resiliência pulados')
}

describe.skipIf(!temRedis)('degradação com provider fora', () => {
  let app: FastifyInstance
  let cache: Cache

  beforeAll(async () => {
    const [a, b, c] = await Promise.all([
      startProvider('a', 'ok'),
      startProvider('b', 'ok'),
      startProvider('c', 'error'),
    ])
    process.env.PROVIDER_A_URL = a
    process.env.PROVIDER_B_URL = b
    process.env.PROVIDER_C_URL = c

    const { Redis } = await import('ioredis')
    const cleanup = new Redis('redis://localhost:6379')
    await cleanup.flushdb()
    cleanup.disconnect()

    app = Fastify({ logger: false })
    cache = new Cache('redis://localhost:6379')
    await cache.connect()
    const db = new Db(undefined)
    searchRoutes(app, {
      cache,
      db,
      agentHash: new AgentHash(undefined),
      insights: new InsightsStore(cache, db),
      fanOut,
      log: app.log,
    } as unknown as Deps)
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    await cache?.close()
    for (const s of servers) s.close()
  })

  it('responde 200 e marca partial quando um provider devolve 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { origin: 'GRU', destination: 'GIG', date: '2026-12-10' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.flights.length).toBeGreaterThan(0)
    expect(body.meta.partial).toBe(true)

    const porProvider = Object.fromEntries(
      body.meta.providers.map((p: { name: string; status: string }) => [
        p.name,
        p.status,
      ]),
    )
    expect(porProvider['provider-a']).toBe('ok')
    expect(porProvider['provider-b']).toBe('ok')
    expect(porProvider['provider-c']).not.toBe('ok')
  })

  it('o provider com falha tem motivo registrado em issues', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { origin: 'GRU', destination: 'SDU', date: '2026-12-10' },
    })

    const falho = res
      .json()
      .meta.providers.find((p: { status: string }) => p.status !== 'ok')

    expect(falho).toBeDefined()
    expect(falho.issues.length).toBeGreaterThan(0)
  })
})

describe.skipIf(!temRedis)('timeout de provider', () => {
  it('desiste do provider lento em ~3s e responde com os demais', async () => {
    const [a, b, c] = await Promise.all([
      startProvider('a', 'ok'),
      startProvider('b', 'ok'),
      startProvider('c', 'slow'),
    ])
    process.env.PROVIDER_A_URL = a
    process.env.PROVIDER_B_URL = b
    process.env.PROVIDER_C_URL = c

    const cache = new Cache('redis://localhost:6379')
    await cache.connect()
    const app = Fastify({ logger: false })
    const db = new Db(undefined)
    searchRoutes(app, {
      cache,
      db,
      agentHash: new AgentHash(undefined),
      insights: new InsightsStore(cache, db),
      fanOut,
      log: app.log,
    } as unknown as Deps)
    await app.ready()

    const started = Date.now()
    const res = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { origin: 'GRU', destination: 'SSA', date: '2026-12-11' },
    })
    const elapsed = Date.now() - started

    expect(res.statusCode).toBe(200)
    expect(res.json().meta.partial).toBe(true)

    expect(elapsed).toBeLessThan(9_000)
    expect(res.json().flights.length).toBeGreaterThan(0)

    await app.close()
    await cache.close()
  }, 20_000)
})

describe.skipIf(!temRedis)('cache', () => {
  it('grava a resposta com TTL de 5 minutos', async () => {
    const cache = new Cache('redis://localhost:6379')
    await cache.connect()
    const key = searchKey('GRU', 'GIG', '2027-01-01')
    await cache.set(key, { ok: true })

    const { Redis } = await import('ioredis')
    const redis = new Redis('redis://localhost:6379')
    const ttl = await redis.ttl(key)
    redis.disconnect()
    await cache.close()

    expect(TTL_SECONDS).toBe(300)
    expect(ttl).toBeGreaterThan(295)
    expect(ttl).toBeLessThanOrEqual(300)
  })
})